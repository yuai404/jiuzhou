#!/usr/bin/env tsx
/**
 * AI 领悟模型联调脚本
 *
 * 作用（做什么 / 不做什么）：
 * 1) 做什么：读取环境变量中的模型服务配置，调用模型生成一份功法草稿，并打印到控制台；支持可选 seed 复现结果。
 * 2) 不做什么：不写数据库、不创建生成任务、不扣除研修点，仅做模型联调验证。
 *
 * 输入/输出：
 * - 输入：CLI 参数（可选）：`--quality <黄|玄|地|天>`、`--type <功法类型>`、`--seed <正整数>`、`--base-model <底模>`、`--model-name <模型名>`。
 * - 输出：控制台打印模型响应、结构化 JSON、功法摘要。
 *
 * 数据流/状态流：
 * 解析参数 -> 共享联调模块请求模型并清洗结果 -> 可选挂技能图标 -> 打印结果。
 *
 * 关键边界条件与坑点：
 * 1) 若功法文本模型配置缺失，脚本会直接失败退出。
 * 2) 技能图标仍然只在显式检测到图片模型配置时才会启用，避免单次文本联调误触发生图。
 */
import '../src/bootstrap/installConsoleLogger.js';
import dotenv from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  generateTechniqueModelDebugResult,
  isTechniqueSkillImageGenerationConfigured,
  overrideTechniqueModelName,
  parseCliArgMap,
  resolveOptionalPositiveIntegerArg,
  resolveTechniqueDebugBaseModelArg,
  resolveTechniqueQualityArg,
  resolveTechniqueQualityByRandom,
  resolveTechniqueTypeArg,
  resolveTechniqueTypeByRandom,
} from '../src/scripts/shared/techniqueModelDebug.js';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const SERVER_ROOT = resolve(SCRIPT_DIR, '..');

const main = async (): Promise<void> => {
  dotenv.config({ path: resolve(SERVER_ROOT, '.env') });
  const args = parseCliArgMap(process.argv.slice(2));
  const qualityArg = resolveTechniqueQualityArg(args.quality);
  if (args.quality && !qualityArg) {
    throw new Error('CLI 参数 --quality 仅支持 黄/玄/地/天');
  }
  const quality = qualityArg ?? resolveTechniqueQualityByRandom();

  const techniqueTypeArg = resolveTechniqueTypeArg(args.type);
  if (args.type && !techniqueTypeArg) {
    throw new Error('CLI 参数 --type 不是受支持的功法类型');
  }
  const techniqueType = techniqueTypeArg ?? resolveTechniqueTypeByRandom();
  const seed = resolveOptionalPositiveIntegerArg(args.seed, 'seed');
  const baseModel = resolveTechniqueDebugBaseModelArg(args['base-model']) ?? undefined;
  overrideTechniqueModelName(args['model-name']);

  const imageEnabled = isTechniqueSkillImageGenerationConfigured();
  const result = await generateTechniqueModelDebugResult({
    quality,
    techniqueType,
    seed,
    baseModel,
    includeSkillIcons: imageEnabled,
  });

  console.log('\n=== AI 领悟模型联调结果 ===');
  console.log(`模型: ${result.modelName}`);
  console.log(`请求品质: ${quality}`);
  console.log(`请求类型: ${techniqueType}`);
  console.log(`Seed: ${result.seed}`);
  console.log(`底模: ${result.baseModel ?? '未指定'}`);
  console.log(`功法: ${result.summary.techniqueName}（${result.summary.techniqueType}）`);
  console.log(`技能数量: ${result.summary.skillCount}`);
  console.log(`层级数量: ${result.summary.layerCount}`);
  console.log(`技能绘图: ${imageEnabled ? '已启用' : '未启用（缺少 AI_TECHNIQUE_IMAGE_MODEL_URL/KEY）'}`);
  console.log('\n--- 归一化后结构化输出(JSON) ---');
  console.log(JSON.stringify(result.candidate, null, 2));
};

void main().catch((error) => {
  const msg = error instanceof Error ? error.message : String(error);
  console.error(`[test-technique-model] ${msg}`);
  process.exit(1);
});
