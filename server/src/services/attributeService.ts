/**
 * 属性加点服务
 */
import { getCharacterComputedByUserId } from './characterComputedService.js';
import { queueCharacterWritebackSnapshot } from './playerWritebackCacheService.js';

type AttributeKey = 'jing' | 'qi' | 'shen';

export interface AddPointResult {
  success: boolean;
  message: string;
  data?: {
    attribute: AttributeKey;
    newValue: number;
    remainingPoints: number;
  };
}

// 加点
export const addAttributePoint = async (
  userId: number,
  attribute: AttributeKey,
  amount: number = 1
): Promise<AddPointResult> => {
  // 验证属性名
  if (!['jing', 'qi', 'shen'].includes(attribute)) {
    return { success: false, message: '无效的属性类型' };
  }

  // 验证数量
  if (amount < 1 || amount > 100) {
    return { success: false, message: '加点数量无效' };
  }

  // 检查可用属性点
  const character = await getCharacterComputedByUserId(userId, {
    bypassStaticCache: true,
  });
  if (!character) {
    return { success: false, message: '角色不存在' };
  }

  const availablePoints = character.attribute_points;
  if (availablePoints < amount) {
    return { success: false, message: '属性点不足' };
  }

  const nextValue = Number(character[attribute]) + amount;
  const remainingPoints = availablePoints - amount;
  queueCharacterWritebackSnapshot(character.id, {
    attribute_points: remainingPoints,
    jing: character.jing + (attribute === 'jing' ? amount : 0),
    qi: character.qi + (attribute === 'qi' ? amount : 0),
    shen: character.shen + (attribute === 'shen' ? amount : 0),
    silver: character.silver,
    spirit_stones: character.spirit_stones,
  });

  return {
    success: true,
    message: '加点成功',
    data: {
      attribute,
      newValue: nextValue,
      remainingPoints,
    },
  };
};

// 减点
export const removeAttributePoint = async (
  userId: number,
  attribute: AttributeKey,
  amount: number = 1
): Promise<AddPointResult> => {
  // 验证属性名
  if (!['jing', 'qi', 'shen'].includes(attribute)) {
    return { success: false, message: '无效的属性类型' };
  }

  // 验证数量
  if (amount < 1 || amount > 100) {
    return { success: false, message: '减点数量无效' };
  }

  // 检查当前属性值
  const character = await getCharacterComputedByUserId(userId, {
    bypassStaticCache: true,
  });
  if (!character) {
    return { success: false, message: '角色不存在' };
  }

  const currentValue = character[attribute];
  if (currentValue < amount) {
    return { success: false, message: '属性点不足以减少' };
  }

  const nextValue = Number(currentValue) - amount;
  const remainingPoints = character.attribute_points + amount;
  queueCharacterWritebackSnapshot(character.id, {
    attribute_points: remainingPoints,
    jing: character.jing - (attribute === 'jing' ? amount : 0),
    qi: character.qi - (attribute === 'qi' ? amount : 0),
    shen: character.shen - (attribute === 'shen' ? amount : 0),
    silver: character.silver,
    spirit_stones: character.spirit_stones,
  });

  return {
    success: true,
    message: '减点成功',
    data: {
      attribute,
      newValue: nextValue,
      remainingPoints,
    },
  };
};

// 批量加点
export const batchAddPoints = async (
  userId: number,
  points: { jing?: number; qi?: number; shen?: number }
): Promise<AddPointResult> => {
  const totalPoints = (points.jing || 0) + (points.qi || 0) + (points.shen || 0);

  if (totalPoints <= 0) {
    return { success: false, message: '请指定加点数量' };
  }

  // 检查可用属性点
  const character = await getCharacterComputedByUserId(userId, {
    bypassStaticCache: true,
  });
  if (!character) {
    return { success: false, message: '角色不存在' };
  }

  const availablePoints = character.attribute_points;
  if (availablePoints < totalPoints) {
    return { success: false, message: '属性点不足' };
  }

  queueCharacterWritebackSnapshot(character.id, {
    attribute_points: availablePoints - totalPoints,
    jing: character.jing + (points.jing || 0),
    qi: character.qi + (points.qi || 0),
    shen: character.shen + (points.shen || 0),
    silver: character.silver,
    spirit_stones: character.spirit_stones,
  });

  return {
    success: true,
    message: '批量加点成功',
    data: {
      attribute: 'jing',
      newValue: character.jing + (points.jing || 0),
      remainingPoints: availablePoints - totalPoints,
    },
  };
};

// 重置属性点（可选功能）
export const resetAttributePoints = async (
  userId: number
): Promise<{ success: boolean; message: string; totalPoints?: number }> => {
  // 获取当前精气神总点数
  const character = await getCharacterComputedByUserId(userId, {
    bypassStaticCache: true,
  });
  if (!character) {
    return { success: false, message: '角色不存在' };
  }

  const { jing, qi, shen } = character;
  const totalPoints = jing + qi + shen;

  queueCharacterWritebackSnapshot(character.id, {
    attribute_points: character.attribute_points + totalPoints,
    jing: 0,
    qi: 0,
    shen: 0,
    silver: character.silver,
    spirit_stones: character.spirit_stones,
  });

  return {
    success: true,
    message: '属性点已重置',
    totalPoints,
  };
};
