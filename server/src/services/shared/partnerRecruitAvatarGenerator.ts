/**
 * AI 伙伴头像生成器
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：根据伙伴名字、品质、元素、定位与描述调用图像模型生成头像，并落到本地 uploads 目录。
 * 2) 做什么：把伙伴头像 prompt、图片压缩与本地落盘集中到单模块，模型 provider 协议由统一图片 client 处理。
 * 3) 不做什么：不写任务状态表、不吞掉业务失败；头像生成失败应由上层触发整单退款。
 *
 * 输入/输出：
 * - 输入：伙伴视觉语义信息。
 * - 输出：本地可访问头像路径 `/uploads/partners/*.webp`。
 *
 * 数据流/状态流：
 * partner recruit draft -> buildPartnerRecruitAvatarPrompt -> imageModelClient -> 压缩落盘 -> partnerRecruitService 回写 job/def。
 *
 * 关键边界条件与坑点：
 * 1) 这里仍复用现有生图环境变量，但业务层不再关心 OpenAI / DashScope 协议差异。
 * 2) 统一图片 client 只返回标准资源 `{ b64, url }`，头像模块必须明确处理“无图片数据”这种失败分支，不能静默吞掉。
 */
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import {
  downloadImageBuffer,
  generateConfiguredImageAsset,
  OPENAI_IMAGE_GENERATION_MAX_RETRIES,
} from '../ai/imageModelClient.js';
import { readImageModelConfig } from '../ai/modelConfig.js';
import {
  PARTNER_RECRUIT_AVATAR_COMPOSITION_RULES,
  PARTNER_RECRUIT_AVATAR_STYLE_RULES,
  PARTNER_RECRUIT_FORM_RULES,
} from './partnerRecruitCreativeDirection.js';
import {
  debugImageGenerationLog,
  summarizeImageGenerationError,
} from './imageGenerationDebugShared.js';

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

const OUTPUT_MAX_EDGE = 384;
const OUTPUT_QUALITY = 84;

const buildPartnerRecruitAvatarPrompt = (input: PartnerRecruitAvatarInput): string => {
  return [
    `生成中国仙侠伙伴头像，角色名「${input.name}」`,
    `伙伴定位：${input.role}`,
    `伙伴品质：${input.quality}`,
    `元素倾向：${input.element}`,
    `伙伴描述：${input.description}`,
    ...PARTNER_RECRUIT_FORM_RULES,
    ...PARTNER_RECRUIT_AVATAR_STYLE_RULES,
    ...PARTNER_RECRUIT_AVATAR_COMPOSITION_RULES,
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

export const generatePartnerRecruitAvatar = async (
  input: PartnerRecruitAvatarInput,
): Promise<string> => {
  const config = readImageModelConfig();
  if (!config) {
    throw new Error('缺少 AI_TECHNIQUE_IMAGE_MODEL_URL 或 AI_TECHNIQUE_IMAGE_MODEL_KEY 配置');
  }

  const prompt = buildPartnerRecruitAvatarPrompt(input);
  debugImageGenerationLog(
    'partner-avatar-image',
    'provider=',
    config.provider,
    'endpoint=',
    config.endpoint,
    'model=',
    config.modelName,
    'retry=',
    config.provider === 'openai' ? OPENAI_IMAGE_GENERATION_MAX_RETRIES : 'none',
    'partnerId=',
    input.partnerId,
  );

  try {
    const generated = await generateConfiguredImageAsset(prompt);
    if (!generated) {
      throw new Error('缺少 AI_TECHNIQUE_IMAGE_MODEL_URL 或 AI_TECHNIQUE_IMAGE_MODEL_KEY 配置');
    }

    if (generated.asset.b64) {
      const localPath = await saveImageBufferToLocal(Buffer.from(generated.asset.b64, 'base64'), input.partnerId);
      debugImageGenerationLog('partner-avatar-image', 'saved from b64:', localPath);
      return localPath;
    }
    if (generated.asset.url) {
      const buffer = await downloadImageBuffer(generated.asset.url, generated.timeoutMs);
      const localPath = await saveImageBufferToLocal(buffer, input.partnerId);
      debugImageGenerationLog('partner-avatar-image', 'saved from url:', localPath);
      return localPath;
    }

    throw new Error('图像模型未返回可用图片数据');
  } catch (error) {
    const summary = summarizeImageGenerationError(error instanceof Error ? error : String(error));
    debugImageGenerationLog('partner-avatar-image', 'generate failed:', summary);
    throw new Error(`伙伴头像生成失败：${summary}`);
  }
};
