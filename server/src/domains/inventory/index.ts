/**
 * 背包领域门面
 * 作用：集中暴露背包相关服务，降低 routes 对 services 目录耦合。
 */
export { default as inventoryService } from '../../services/inventoryService.js';
export { default as itemService } from '../../services/itemService.js';
export { default as craftService } from '../../services/craftService.js';
export { default as gemSynthesisService } from '../../services/gemSynthesisService.js';

export type {
  InventoryInfo,
  InventoryItem,
  InventoryLocation,
  SlottedInventoryLocation,
} from '../../services/inventoryService.js';

export * from '../../services/inventoryService.js';
export * from '../../services/itemService.js';
export * from '../../services/craftService.js';
export * from '../../services/gemSynthesisService.js';

