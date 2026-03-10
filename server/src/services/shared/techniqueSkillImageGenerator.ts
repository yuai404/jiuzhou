/**
 * 生成功法技能图标（绘图 AI）
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：根据功法与技能语义调用绘图模型，生成技能图标并写入本地 uploads 目录，返回可访问路径。
 * 2) 不做什么：不负责业务状态机、不负责数据库写入、不抛出阻断主流程异常（失败时返回 null）。
 *
 * 输入/输出：
 * - 输入：技能语义上下文（功法名、技能名、描述、元素、效果摘要等）。
 * - 输出：`/uploads/techniques/*.png` 或远端 URL；失败返回 null。
 *
 * 数据流/状态流：
 * 上下文 -> prompt 拼装 -> 调用图像模型 -> 解析 b64/url -> 本地落盘(可选) -> 返回图标路径。
 *
 * 关键边界条件与坑点：
 * 1) 外部模型可能返回非标准结构，解析失败必须静默回退，不能影响主链路。
 * 2) 批量生成默认串行执行，避免短时间并发压垮第三方配额；数量可由环境变量限制。
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

export type TechniqueSkillImageInput = {
  skillId: string;
  techniqueName: string;
  techniqueType: string;
  techniqueQuality: string;
  techniqueElement: string;
  skillName: string;
  skillDescription: string;
  skillEffects: unknown[];
};

type ImageModelConfig = {
  provider: 'openai' | 'dashscope';
  endpoint: string;
  apiKey: string;
  modelName: string;
  size: string;
  timeoutMs: number;
  maxSkills: number;
  responseFormat: string;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DEFAULT_IMAGE_MODEL = 'qwen-image-2.0';
const DEFAULT_IMAGE_PROVIDER = 'auto';
const DEFAULT_IMAGE_SIZE = '512x512';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_MAX_SKILLS = 4;
const DEFAULT_IMAGE_RESPONSE_FORMAT = 'b64_json';
const LOCAL_IMAGE_PREFIX = '/uploads/techniques';
const DASHSCOPE_SYNC_IMAGE_PATH = '/api/v1/services/aigc/multimodal-generation/generation';
export const TECHNIQUE_SKILL_IMAGE_OUTPUT_MAX_EDGE = 256;
export const TECHNIQUE_SKILL_IMAGE_OUTPUT_WEBP_QUALITY = 82;

const asString = (raw: unknown): string => (typeof raw === 'string' ? raw.trim() : '');
const asBool = (raw: unknown, fallback: boolean): boolean => {
  const text = asString(raw).toLowerCase();
  if (!text) return fallback;
  if (text === '1' || text === 'true' || text === 'yes' || text === 'on') return true;
  if (text === '0' || text === 'false' || text === 'no' || text === 'off') return false;
  return fallback;
};

const asPositiveInt = (raw: unknown, fallback: number): number => {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  const value = Math.floor(n);
  return value > 0 ? value : fallback;
};

const resolveOpenAIImageEndpoint = (raw: string): string => {
  const endpoint = raw.replace(/\/+$/, '');
  if (!endpoint) return '';
  if (/\/images\/generations$/i.test(endpoint)) return endpoint;
  if (/\/v1$/i.test(endpoint)) return `${endpoint}/images/generations`;
  return `${endpoint}/v1/images/generations`;
};

const resolveDashScopeImageEndpoint = (raw: string): string => {
  const endpoint = raw.replace(/\/+$/, '');
  if (!endpoint) return '';
  if (new RegExp(`${DASHSCOPE_SYNC_IMAGE_PATH}$`, 'i').test(endpoint)) {
    return endpoint;
  }
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
    if (/\/api\/v1$/i.test(endpoint)) {
      return `${endpoint}/services/aigc/multimodal-generation/generation`;
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

const resolveImageProvider = (providerRaw: string, endpointRaw: string, modelName: string): 'openai' | 'dashscope' => {
  const provider = providerRaw.toLowerCase();
  if (provider === 'openai' || provider === 'dashscope') return provider;

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

const ensureImageDir = async (): Promise<string> => {
  const dir = path.join(__dirname, '../../../uploads/techniques');
  await fs.mkdir(dir, { recursive: true });
  return dir;
};

const getDebugEnabled = (): boolean => asBool(process.env.AI_TECHNIQUE_IMAGE_DEBUG, false);

const debugLog = (...args: unknown[]): void => {
  if (!getDebugEnabled()) return;
  console.log('[technique-image]', ...args);
};

const summarizeEffects = (effects: unknown[]): string => {
  if (!Array.isArray(effects) || effects.length <= 0) return '无明显特效';
  const parts: string[] = [];
  for (const raw of effects) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
    const row = raw as Record<string, unknown>;
    const type = asString(row.type);
    if (!type) continue;
    if (type === 'damage') {
      parts.push(`伤害(${asString(row.damageType) || '未指定'}${asString(row.element) ? `/${asString(row.element)}` : ''})`);
      continue;
    }
    if (type === 'control') {
      parts.push(`控制(${asString(row.controlType) || '未指定'})`);
      continue;
    }
    if (type === 'mark') {
      parts.push(`印记(${asString(row.markId) || '未指定'})`);
      continue;
    }
    parts.push(type);
  }
  return parts.length > 0 ? parts.join('、') : '无明显特效';
};

export const buildTechniqueSkillImagePrompt = (input: TechniqueSkillImageInput): string => {
  return [
    ` - 生成2D中国仙侠游戏《九州修仙录》技能图标《${input.skillName}》`,
    ` - 技能描述：${input.skillDescription}`,
    ' - 铺满整个画布，单主体，背景简化，强对比，避免细碎噪点，满画幅无边框无留白',
    ' - 不要任何文字、英文',
  ].join('\n');
};

const readImageModelConfig = (): ImageModelConfig | null => {
  const endpointRaw = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_URL);
  const apiKey = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_KEY);
  if (!endpointRaw || !apiKey) return null;
  const modelName = asString(process.env.AI_TECHNIQUE_IMAGE_MODEL_NAME) || DEFAULT_IMAGE_MODEL;
  const provider = resolveImageProvider(
    asString(process.env.AI_TECHNIQUE_IMAGE_PROVIDER) || DEFAULT_IMAGE_PROVIDER,
    endpointRaw,
    modelName,
  );

  return {
    provider,
    endpoint: provider === 'dashscope'
      ? resolveDashScopeImageEndpoint(endpointRaw)
      : resolveOpenAIImageEndpoint(endpointRaw),
    apiKey,
    modelName,
    size: asString(process.env.AI_TECHNIQUE_IMAGE_SIZE) || DEFAULT_IMAGE_SIZE,
    timeoutMs: asPositiveInt(process.env.AI_TECHNIQUE_IMAGE_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
    maxSkills: asPositiveInt(process.env.AI_TECHNIQUE_IMAGE_MAX_SKILLS, DEFAULT_MAX_SKILLS),
    responseFormat: asString(process.env.AI_TECHNIQUE_IMAGE_RESPONSE_FORMAT) || DEFAULT_IMAGE_RESPONSE_FORMAT,
  };
};

const getSafeSkillId = (skillId: string): string => {
  return (skillId || 'skill')
    .replace(/[^a-zA-Z0-9_-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 48) || 'skill';
};

/**
 * 压缩模型输出后的技能图片
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：统一把模型原始图片压缩为更适合前端加载的 WebP，并限制最大边长，避免落盘原图过大。
 * 2) 做什么：作为 b64 与远端 URL 两条图片来源链路的共同压缩入口，减少重复处理逻辑。
 * 3) 不做什么：不负责网络下载、不负责文件命名、不区分具体模型来源。
 *
 * 输入/输出：
 * - 输入：模型输出的原始图片 Buffer。
 * - 输出：压缩后的 WebP Buffer；压缩失败返回 null。
 *
 * 数据流/状态流：
 * 模型原始字节 -> compressTechniqueSkillImageBuffer -> saveImageBufferToLocal -> uploads/techniques。
 *
 * 关键边界条件与坑点：
 * 1) 只允许缩小不允许放大，避免小图被错误重采样导致发糊。
 * 2) 图像可能带有 EXIF 方向信息，压缩前需自动旋正，否则前端显示方向可能异常。
 */
export const compressTechniqueSkillImageBuffer = async (buffer: Buffer): Promise<Buffer | null> => {
  if (buffer.length <= 0) return null;
  try {
    const compressed = await sharp(buffer)
      .rotate()
      .resize({
        width: TECHNIQUE_SKILL_IMAGE_OUTPUT_MAX_EDGE,
        height: TECHNIQUE_SKILL_IMAGE_OUTPUT_MAX_EDGE,
        fit: 'inside',
        withoutEnlargement: true,
      })
      .webp({
        quality: TECHNIQUE_SKILL_IMAGE_OUTPUT_WEBP_QUALITY,
        effort: 4,
      })
      .toBuffer();
    return compressed.length > 0 ? compressed : null;
  } catch {
    return null;
  }
};

const saveImageBufferToLocal = async (buffer: Buffer, skillId: string): Promise<string | null> => {
  try {
    if (buffer.length <= 0) return null;
    const compressedBuffer = await compressTechniqueSkillImageBuffer(buffer);
    if (!compressedBuffer || compressedBuffer.length <= 0) return null;
    const dir = await ensureImageDir();
    const safeSkillId = getSafeSkillId(skillId);
    const fileName = `tech-skill-${Date.now()}-${safeSkillId}.webp`;
    const filePath = path.join(dir, fileName);
    await fs.writeFile(filePath, compressedBuffer);
    return `${LOCAL_IMAGE_PREFIX}/${fileName}`;
  } catch {
    return null;
  }
};

const saveB64ImageToLocal = async (b64: string, skillId: string): Promise<string | null> => {
  if (!b64) return null;
  return saveImageBufferToLocal(Buffer.from(b64, 'base64'), skillId);
};

const fetchJsonWithTimeout = async (
  endpoint: string,
  payload: Record<string, unknown>,
  apiKey: string,
  timeoutMs: number,
): Promise<{ ok: boolean; status: number; body: Record<string, unknown> | null; rawText: string }> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const rawText = await resp.text();
    if (!rawText) return { ok: resp.ok, status: resp.status, body: null, rawText: '' };
    try {
      return {
        ok: resp.ok,
        status: resp.status,
        body: JSON.parse(rawText) as Record<string, unknown>,
        rawText,
      };
    } catch {
      return { ok: resp.ok, status: resp.status, body: null, rawText };
    }
  } finally {
    clearTimeout(timer);
  }
};

const fetchRemoteImageToLocal = async (
  imageUrl: string,
  skillId: string,
  timeoutMs: number,
): Promise<string | null> => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const resp = await fetch(imageUrl, { method: 'GET', signal: controller.signal });
    if (!resp.ok) return null;
    const bytes = await resp.arrayBuffer();
    return saveImageBufferToLocal(Buffer.from(bytes), skillId);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
};

const readOpenAIImageResult = (body: Record<string, unknown>): { b64: string; url: string } => {
  const first = Array.isArray(body.data) ? body.data[0] : null;
  if (!first || typeof first !== 'object' || Array.isArray(first)) return { b64: '', url: '' };
  const data = first as Record<string, unknown>;
  return {
    b64: asString(data.b64_json),
    url: asString(data.url),
  };
};

const readDashScopeImageResult = (body: Record<string, unknown>): { url: string } => {
  const output = body.output;
  if (!output || typeof output !== 'object' || Array.isArray(output)) return { url: '' };
  const outputRow = output as Record<string, unknown>;
  const choices = Array.isArray(outputRow.choices) ? outputRow.choices : [];
  const firstChoice = choices[0];
  if (!firstChoice || typeof firstChoice !== 'object' || Array.isArray(firstChoice)) return { url: '' };
  const message = (firstChoice as Record<string, unknown>).message;
  if (!message || typeof message !== 'object' || Array.isArray(message)) return { url: '' };
  const contentList = Array.isArray((message as Record<string, unknown>).content)
    ? ((message as Record<string, unknown>).content as unknown[])
    : [];
  for (const row of contentList) {
    if (!row || typeof row !== 'object' || Array.isArray(row)) continue;
    const imageUrl = asString((row as Record<string, unknown>).image);
    if (imageUrl) return { url: imageUrl };
  }
  return { url: '' };
};

export const generateTechniqueSkillIcon = async (input: TechniqueSkillImageInput): Promise<string | null> => {
  const cfg = readImageModelConfig();
  if (!cfg || !cfg.endpoint) return null;
  const prompt = buildTechniqueSkillImagePrompt(input);
  debugLog('provider=', cfg.provider, 'endpoint=', cfg.endpoint, 'model=', cfg.modelName);
  try {
    if (cfg.provider === 'dashscope') {
      const payload = {
        model: cfg.modelName,
        input: {
          messages: [{
            role: 'user',
            content: [{ text: prompt }],
          }],
        },
        parameters: {
          size: normalizeSizeForDashScope(cfg.size),
          n: 1,
          prompt_extend: true,
          watermark: false,
        },
      };
      const result = await fetchJsonWithTimeout(cfg.endpoint, payload, cfg.apiKey, cfg.timeoutMs);
      if (!result.ok || !result.body) {
        debugLog('dashscope request failed status=', result.status, 'body=', result.rawText.slice(0, 500));
        return null;
      }
      const { url } = readDashScopeImageResult(result.body);
      if (!url) {
        debugLog('dashscope response has no image url', JSON.stringify(result.body).slice(0, 500));
        return null;
      }
      const localPath = await fetchRemoteImageToLocal(url, input.skillId, cfg.timeoutMs);
      if (localPath) return localPath;
      return url;
    }

    const payloadCandidates: Array<Record<string, unknown>> = [
      {
        model: cfg.modelName,
        prompt,
        size: cfg.size,
        response_format: cfg.responseFormat,
        n: 1,
      },
      {
        model: cfg.modelName,
        prompt,
        size: cfg.size,
        n: 1,
      },
    ];

    for (const payload of payloadCandidates) {
      const result = await fetchJsonWithTimeout(cfg.endpoint, payload, cfg.apiKey, cfg.timeoutMs);
      if (!result.ok || !result.body) {
        debugLog('openai-compatible request failed status=', result.status, 'body=', result.rawText.slice(0, 500));
        continue;
      }

      const { b64, url } = readOpenAIImageResult(result.body);
      if (b64) {
        const localPath = await saveB64ImageToLocal(b64, input.skillId);
        if (localPath) return localPath;
      }

      if (url) {
        const localPath = await fetchRemoteImageToLocal(url, input.skillId, cfg.timeoutMs);
        if (localPath) return localPath;
        return url;
      }
    }
    return null;
  } catch {
    return null;
  }
};

export const generateTechniqueSkillIconMap = async (
  inputs: TechniqueSkillImageInput[],
): Promise<Map<string, string>> => {
  const cfg = readImageModelConfig();
  if (!cfg || !cfg.endpoint) return new Map();

  const out = new Map<string, string>();
  const list = inputs.slice(0, cfg.maxSkills);
  for (const input of list) {
    const icon = await generateTechniqueSkillIcon(input);
    if (!icon) continue;
    out.set(input.skillId, icon);
  }
  return out;
};
