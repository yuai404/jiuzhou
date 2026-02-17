/**
 * 战斗领域门面
 * 作用：为路由层提供稳定导入入口，内部实现仍由 services 承载。
 */
export { default as battleService } from '../../services/battleService.js';
export * from '../../services/battleService.js';

