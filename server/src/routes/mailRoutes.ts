/**
 * 九州修仙录 - 邮件路由
 */
import { Router, Request, Response } from 'express';
import {
  getMailList,
  readMail,
  claimAttachments,
  claimAllAttachments,
  deleteMail,
  deleteAllMails,
  markAllRead,
  getUnreadCount
} from '../services/mailService.js';
import { verifyToken } from '../services/authService.js';
import { query } from '../config/database.js';

const router = Router();

type AuthedRequest = Request & { userId: number };

// 认证中间件
const authMiddleware = (req: Request, res: Response, next: () => void) => {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({ success: false, message: '未登录' });
    return;
  }

  const token = authHeader.split(' ')[1];
  const { valid, decoded } = verifyToken(token);

  if (!valid || !decoded) {
    res.status(401).json({ success: false, message: '登录已过期' });
    return;
  }

  (req as AuthedRequest).userId = decoded.id;
  next();
};

// 获取角色ID的辅助函数
const getCharacterId = async (userId: number): Promise<number | null> => {
  const result = await query(
    'SELECT id FROM characters WHERE user_id = $1',
    [userId]
  );
  return result.rows.length > 0 ? result.rows[0].id : null;
};

router.use(authMiddleware);

// ============================================
// 获取邮件列表
// ============================================
router.get('/list', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const page = parseInt(req.query.page as string) || 1;
    const pageSize = Math.min(parseInt(req.query.pageSize as string) || 50, 100);

    const result = await getMailList(userId, characterId, page, pageSize);

    return res.json({
      success: true,
      data: {
        mails: result.mails,
        total: result.total,
        unreadCount: result.unreadCount,
        unclaimedCount: result.unclaimedCount,
        page,
        pageSize
      }
    });
  } catch (error) {
    console.error('获取邮件列表失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 获取未读数量（红点）
// ============================================
router.get('/unread', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const result = await getUnreadCount(userId, characterId);

    return res.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('获取未读数量失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 阅读邮件
// ============================================
router.post('/read', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { mailId } = req.body;
    if (!mailId || !Number.isInteger(mailId)) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    const result = await readMail(userId, characterId, mailId);
    return res.json(result);
  } catch (error) {
    console.error('阅读邮件失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 领取附件
// ============================================
router.post('/claim', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { mailId } = req.body;
    if (!mailId || !Number.isInteger(mailId)) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    const result = await claimAttachments(userId, characterId, mailId);
    return res.json(result);
  } catch (error) {
    console.error('领取附件失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 一键领取所有附件
// ============================================
router.post('/claim-all', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const result = await claimAllAttachments(userId, characterId);
    return res.json(result);
  } catch (error) {
    console.error('一键领取失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 删除邮件
// ============================================
router.post('/delete', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { mailId } = req.body;
    if (!mailId || !Number.isInteger(mailId)) {
      return res.status(400).json({ success: false, message: '参数错误' });
    }

    const result = await deleteMail(userId, characterId, mailId);
    return res.json(result);
  } catch (error) {
    console.error('删除邮件失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 一键删除所有邮件
// ============================================
router.post('/delete-all', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const { onlyRead } = req.body;
    const result = await deleteAllMails(userId, characterId, !!onlyRead);
    return res.json(result);
  } catch (error) {
    console.error('一键删除失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

// ============================================
// 标记全部已读
// ============================================
router.post('/read-all', async (req: Request, res: Response) => {
  try {
    const userId = (req as AuthedRequest).userId;
    const characterId = await getCharacterId(userId);

    if (!characterId) {
      return res.status(404).json({ success: false, message: '角色不存在' });
    }

    const result = await markAllRead(userId, characterId);
    return res.json(result);
  } catch (error) {
    console.error('标记已读失败:', error);
    return res.status(500).json({ success: false, message: '服务器错误' });
  }
});

export default router;
