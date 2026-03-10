/**
 * AI 伙伴头像生成器
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：根据伙伴名字、品质、元素、定位与描述调用图像模型生成头像，并落到本地 uploads 目录。
 * 2) 做什么：把伙伴头像 prompt、模型请求、图片压缩与本地落盘集中到单模块，避免招募 service 内部塞满杂项逻辑。
 * 3) 不做什么：不写任务状态表、不吞掉业务失败；头像生成失败应由上层触发整单退款。
 *
 * 输入/输出：
 * - 输入：伙伴视觉语义信息。
 * - 输出：本地可访问头像路径 `/uploads/partners/*.webp`。
 *
 * 数据流/状态流：
 * partner recruit draft -> buildPartnerRecruitAvatarPrompt -> 图像模型 -> 压缩落盘 -> partnerRecruitService 回写 job/def。
 *
 * 关键边界条件与坑点：
 * 1) 这里直接复用现有生图环境变量，避免再维护第二套模型接入配置，但不会为缺失配置提供兜底图。
 * 2) 外部模型返回可能是 b64、URL 或不同 provider 结构，解析失败必须向上抛错，让招募任务明确失败退款。
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

type ImageProvider = 'openai' | 'dashscope';

type ImageModelConfig = {
  provider: ImageProvider;
  endpoint: string;
  apiKey: string;
  modelName: string;
  size: string;
  timeoutMs: number;
  responseFormat: string;
};

export type PartnerRecruitAvatarInput = {
  partnerId: string;
  name: string;
  quality: string;
  element: string;
  role: string;
  description: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_IMAGE_MODEL = 'qwen-image-2.0';
const DEFAULT_IMAGE_SIZE = '512x512';
const DEFAULT_TIMEOUT_MS = 20_000;
const DEFAULT_IMAGE_RESPONSE_FORMAT = 'b64_json';
const OUTPUT_MAX_EDGE = 384;
const OUTPUT_QUALITY = 84;
const DASHSCOPE_SYNC_IMAGE_PATH = '/api/v1/services/aigc/multimodal-generation/generation';

const asString = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');

const asPositiveInt = (raw: unknown, fallback: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const normalized = Math.floor(n);
  return normalized > 0 ? normalized : fallback;
};

const trimTrailingSlash = (value: string): string => value.replace(/\/+$/, '');

const resolveOpenAIImageEndpoint = (raw: string): string => {
  const endpoint = trimTrailingSlash(raw);
  if (!endpoint) return '';
  if (/\/images\/generations$/i.test(endpoint)) return endpoint;
  if (/\/v1$/i.test(endpoint)) return `${endpoint}/images/generations`;
  return `${endpoint}/v1/images/generations`;
};

const resolveDashScopeImageEndpoint = (raw: string): string => {
  const endpoint = trimTrailingSlash(raw);
  if (!endpoint) return '';
  try {
    const parsed = new URL(endpoint);
    const cleanPath = parsed.pathname.replace(/\/+$/, '');
    if (new RegExp(`${DASHSCOPE_SYNC_IMAGE_PATH}$`, 'i').test(cleanPath)) {
      return `${parsed.origin}${cleanPath}`;
    }
    return `${parsed.origin}${DASHSCOPE_SYNC_IMAGE_PATH}`;
  } catch {
    if (/\/compatible-mode(\/v1)?$/i.test(endpoint)) {
      return endpoint.replace(/\/compatible-mode(\/v1)?$/i, DASHSCOPE_SYNC_IMAGE_PATH);
    }
    if (/\/v1$/i.test(endpoint)) {
      return endpoint.replace(/\/v1$/i, DASHSCOPE_SYNC_IMAGE_PATH);
    }
    return `${endpoint}${DASHSCOPE_SYNC_IMAGE_PATH}`;
  }
};

const normalizeSizeForDashScope = (size: string): string => {
  const compact = size.replace(/\s+/g, '');
  if (/^\d+\*\d+$/i.test(compact)) return compact;
  if (/^\d+x\d+$/i.test(compact)) return compact.replace(/x/gi, '*');
  return DEFAULT_IMAGE_SIZE.replace('x', '*');
};

const resolveImageProvider = (endpointRaw: string, modelName: string): ImageProvider => {
  const endpoint = endpointRaw.toLowerCase();
  const model = modelName.toLowerCase();
  if (
    endpoint.includes('dashscope') ||
    endpoint.includes('/compatible-mode') ||
    model.startsWith('qwen-image')
  ) {
    return 'dashscope';
  }
  return 'openai';
};

const readImageModelConfig = (): ImageModelConfig => {
  const endpointRaw = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_URL);
  const apiKey = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_KEY);
  const modelName = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_NAME) || DEFAULT_IMAGE_MODEL;
  if (!endpointRaw || !apiKey) {
    throw new Error('缺少 AI_TECHNIQUE_IMAGE_MODEL_URL 或 AI_TECHNIQUE_IMAGE_MODEL_KEY 配置');
  }
  const provider = resolveImageProvider(endpointRaw, modelName);
  return {
    provider,
    endpoint: provider === 'dashscope'
      ? resolveDashScopeImageEndpoint(endpointRaw)
      : resolveOpenAIImageEndpoint(endpointRaw),
    apiKey,
    modelName,
    size: asString(process.env.AI_TECHNIQUE_IMAGE_SIZE) || DEFAULT_IMAGE_SIZE,
    timeoutMs: asPositiveInt(process.env.AI_TECHNIQUE_IMAGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    responseFormat: asString(process.env.AI_TECHNIQUE_IMAGE_RESPONSE_FORMAT) || DEFAULT_IMAGE_RESPONSE_FORMAT,
  };
};

const buildPartnerRecruitAvatarPrompt = (input: PartnerRecruitAvatarInput): string => {
  return [
    `生成中国仙侠角色头像，角色名「${input.name}」`,
    `角色定位：${input.role}`,
    `角色品质：${input.quality}`,
    `元素倾向：${input.element}`,
    `角色描述：${input.description}`,
    '半身角色立绘头像，单人物正面或微侧，东方仙侠服饰，人物面部清晰',
    '背景简洁，避免武器遮挡面部，避免多人，避免文字水印，避免 Q 版',
  ].join('\n');
};

const ensureImageDir = async (): Promise<string> => {
  const dir = path.join(__dirname, '../../../uploads/partners');
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const getSafePartnerId = (partnerId: string): string => {
  return (partnerId || 'partner')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'partner';
};

const compressImageBuffer = async (buffer: Buffer): Promise<Buffer> => {
  return sharp(buffer)
    .rotate()
    .resize({
      width: OUTPUT_MAX_EDGE,
      height: OUTPUT_MAX_EDGE,
      fit: 'cover',
      withoutEnlargement: false,
    })
    .webp({
      quality: OUTPUT_QUALITY,
      effort: 4,
    })
    .toBuffer();
};

const saveImageBufferToLocal = async (buffer: Buffer, partnerId: string): Promise<string> => {
  const dir = await ensureImageDir();
  const safeId = getSafePartnerId(partnerId);
  const fileName = `${safeId}-${Date.now().toString(36)}.webp`;
  const outputPath = path.join(dir, fileName);
  const compressed = await compressImageBuffer(buffer);
  await fs.writeFile(outputPath, compressed);
  return `/uploads/partners/${fileName}`;
};

const readBufferFromUrl = async (url: string, timeoutMs: number): Promise<Buffer> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`下载头像失败：${response.status}`);
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    if (buffer.length <= 0) {
      throw new Error('下载头像失败：返回空图片');
    }
    return buffer;
  } finally {
    clearTimeout(timer);
  }
};

const extractOpenAICompatibleImage = async (
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Buffer> => {
  const first = Array.isArray(body.data) ? (body.data[0] as Record<string, unknown> | undefined) : undefined;
  const b64Json = asString(first?.b64_json);
  if (b64Json) {
    return Buffer.from(b64Json, 'base64');
  }
  const url = asString(first?.url);
  if (url) {
    return readBufferFromUrl(url, timeoutMs);
  }
  throw new Error('图像模型未返回可用图片数据');
};

const extractDashScopeImage = async (
  body: Record<string, unknown>,
  timeoutMs: number,
): Promise<Buffer> => {
  const output = body.output && typeof body.output === 'object' && !Array.isArray(body.output)
    ? (body.output as Record<string, unknown>)
    : null;
  const results = output && Array.isArray(output.results) ? output.results : [];
  const first = results[0] && typeof results[0] === 'object' && !Array.isArray(results[0])
    ? (results[0] as Record<string, unknown>)
    : null;
  const b64 = asString(first?.b64_image);
  if (b64) {
    return Buffer.from(b64, 'base64');
  }
  const url = asString(first?.url);
  if (url) {
    return readBufferFromUrl(url, timeoutMs);
  }
  throw new Error('图像模型未返回可用图片数据');
};

export const generatePartnerRecruitAvatar = async (
  input: PartnerRecruitAvatarInput,
): Promise<string> => {
  const config = readImageModelConfig();
  const prompt = buildPartnerRecruitAvatarPrompt(input);
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);

  try {
    const payload = config.provider === 'dashscope'
      ? {
          model: config.modelName,
          input: {
            prompt,
          },
          parameters: {
            size: normalizeSizeForDashScope(config.size),
          },
        }
      : {
          model: config.modelName,
          prompt,
          size: config.size,
          response_format: config.responseFormat,
        };
    const headers = config.provider === 'dashscope'
      ? {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
          'X-DashScope-Async': 'disable',
        }
      : {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`,
        };
    const response = await fetch(config.endpoint, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
      signal: controller.signal,
    });
    if (!response.ok) {
      const rawText = await response.text();
      throw new Error(`头像模型请求失败：${response.status} ${rawText.slice(0, 200)}`.trim());
    }
    const body = (await response.json()) as Record<string, unknown>;
    const buffer = config.provider === 'dashscope'
      ? await extractDashScopeImage(body, config.timeoutMs)
      : await extractOpenAICompatibleImage(body, config.timeoutMs);
    if (buffer.length <= 0) {
      throw new Error('头像模型返回空图片');
    }
    return saveImageBufferToLocal(buffer, input.partnerId);
  } finally {
    clearTimeout(timer);
  }
};
