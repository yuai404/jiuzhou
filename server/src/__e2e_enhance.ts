import { createItem } from './services/itemService.js';
import { query } from './config/database.js';

type Json = Record<string, unknown>;

const base = process.env.E2E_BASE_URL || 'http://localhost:6012';

const parseJsonOrThrow = (status: number, text: string): any => {
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`非JSON响应 ${status}: ${text.slice(0, 200)}`);
  }
};

const getJson = async (url: string, token?: string): Promise<any> => {
  const res = await fetch(url, {
    method: 'GET',
    headers: token ? { authorization: `Bearer ${token}` } : undefined,
  });
  const text = await res.text();
  const json = parseJsonOrThrow(res.status, text);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json;
};

const postJson = async (url: string, body: Json, token?: string): Promise<any> => {
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  const json = parseJsonOrThrow(res.status, text);
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 300)}`);
  return json;
};

const findInBag = async (token: string, predicate: (it: any) => boolean): Promise<any | null> => {
  const list = await getJson(`${base}/api/inventory/items?location=bag&page=1&pageSize=200`, token);
  const items = Array.isArray(list?.data?.items) ? list.data.items : [];
  return items.find(predicate) ?? null;
};

const main = async () => {
  const username = `e2e${String(Date.now()).slice(-13)}`;
  const password = 'pass123456';

  const reg = await postJson(`${base}/api/auth/register`, { username, password });
  if (!reg?.success) throw new Error(`register failed: ${reg?.message}`);
  const token = String(reg.data.token);
  const userId = Number(reg.data.user.id);

  const nickname = `测试${Math.floor(Math.random() * 9000 + 1000)}`;
  const ch = await postJson(`${base}/api/character/create`, { nickname, gender: 'male' }, token);
  if (!ch?.success) throw new Error(`create character failed: ${ch?.message}`);
  const characterId = Number(ch.data.character.id);

  const eq = await createItem(userId, characterId, 'equip-weapon-003', 1, { location: 'bag' });
  if (!eq.success || !eq.itemIds?.[0]) throw new Error(`create equip failed: ${eq.message}`);
  const equipId = Number(eq.itemIds[0]);

  const mats = await createItem(userId, characterId, 'enhance-001', 50, { location: 'bag' });
  if (!mats.success) throw new Error(`create material failed: ${mats.message}`);

  const equipBefore = await findInBag(token, (x) => Number(x?.id) === equipId);
  const matBefore = await findInBag(token, (x) => String(x?.item_def_id) === 'enhance-001');
  const before = {
    lv: Number(equipBefore?.strengthen_level ?? 0),
    wugong: Number(equipBefore?.def?.base_attrs?.wugong ?? 0),
    matQty: Number(matBefore?.qty ?? 0),
  };

  const logs: Array<{ i: number; success: boolean; msg: string; lv: number }> = [];
  let seenSuccess = false;
  let seenFail = false;
  for (let i = 1; i <= 30 && !(seenSuccess && seenFail); i++) {
    const r = await postJson(`${base}/api/inventory/enhance`, { itemId: equipId }, token);
    logs.push({
      i,
      success: Boolean(r?.success),
      msg: String(r?.message ?? ''),
      lv: Number(r?.data?.strengthenLevel ?? 0),
    });
    if (r?.success) seenSuccess = true;
    else seenFail = true;
  }

  const equipAfter = await findInBag(token, (x) => Number(x?.id) === equipId);
  const matAfter = await findInBag(token, (x) => String(x?.item_def_id) === 'enhance-001');
  const after = {
    lv: Number(equipAfter?.strengthen_level ?? 0),
    wugong: Number(equipAfter?.def?.base_attrs?.wugong ?? 0),
    matQty: Number(matAfter?.qty ?? 0),
  };

  await query(
    "UPDATE item_instance SET location = 'auction', location_slot = NULL, equipped_slot = NULL, updated_at = NOW() WHERE id = $1 AND owner_character_id = $2",
    [equipId, characterId],
  );
  const trade = await postJson(`${base}/api/inventory/enhance`, { itemId: equipId }, token);

  await query(
    "UPDATE item_instance SET location = 'bag', location_slot = NULL, equipped_slot = NULL, locked = true, updated_at = NOW() WHERE id = $1 AND owner_character_id = $2",
    [equipId, characterId],
  );
  const locked = await postJson(`${base}/api/inventory/enhance`, { itemId: equipId }, token);

  await query(
    "UPDATE item_instance SET locked = false, location = 'bag', location_slot = NULL, strengthen_level = 15, updated_at = NOW() WHERE id = $1 AND owner_character_id = $2",
    [equipId, characterId],
  );
  const cap = await postJson(`${base}/api/inventory/enhance`, { itemId: equipId }, token);

  console.log(
    JSON.stringify({
      username,
      userId,
      characterId,
      equipId,
      before,
      logs,
      after,
      trade: { success: trade?.success, msg: trade?.message },
      locked: { success: locked?.success, msg: locked?.message },
      cap: { success: cap?.success, msg: cap?.message },
    }),
  );
};

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
