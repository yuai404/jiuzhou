/**
 * 更新日志弹窗。
 *
 * 作用：
 * 1. 以游戏内功能弹窗的形式顺序展示所有更新记录，作为“更新日志”功能的唯一页面入口。
 * 2. 复用共享派生层输出的稳定视图模型，把每个版本渲染成“日期 + 更新内容”的简单块结构。
 * 3. 不做什么：不发请求、不维护版本数据本身，也不参与菜单分发或全局路由切换。
 *
 * 输入 / 输出：
 * - 输入：弹窗开关、关闭回调。
 * - 输出：更新日志 Modal；按时间倒序展示全部更新块。
 *
 * 数据流 / 状态流：
 * `Game/index.tsx` 控制 open
 * -> `changeLogShared.ts` 提供排序后的版本视图
 * -> 本组件按顺序渲染“日期 + 更新内容”块。
 *
 * 复用设计说明：
 * 1. 版本视图模型在共享层模块级一次构建，本组件只读取结果，避免 render 时重复排序与聚合。
 * 2. 页面不再维护左栏、选中态和详情切换，减少不必要的状态与条件分支。
 * 3. 桌面端与移动端共用同一套顺序流布局，只依赖 CSS 做间距调整，降低维护成本。
 *
 * 关键边界条件与坑点：
 * 1. 更新块必须保持时间倒序，避免新版本被旧记录压到下方。
 * 2. 每个更新块都只展示真实条目，不补伪造标题或占位正文。
 */

import { Empty, Modal } from 'antd';
import { CHANGE_LOG_VIEW_MODEL } from './changeLogShared';
import ChangeLogHtmlContent from './ChangeLogHtmlContent';
import './index.scss';

interface ChangeLogModalProps {
  open: boolean;
  onClose: () => void;
}

const ChangeLogModal: React.FC<ChangeLogModalProps> = ({ open, onClose }) => {
  return (
    <Modal
      open={open}
      onCancel={onClose}
      footer={null}
      title={null}
      centered
      width="min(820px, calc(100vw - 16px))"
      className="change-log-modal"
      destroyOnHidden
    >
      <div className="change-log-shell">
        <div className="change-log-head">
          <div className="change-log-title">更新日志</div>
        </div>

        <div className="change-log-body">
          {CHANGE_LOG_VIEW_MODEL.versions.length > 0 ? (
            <div className="change-log-entry-list">
              {CHANGE_LOG_VIEW_MODEL.versions.map((version) => (
                <section key={version.releasedAt} className="change-log-entry">
                  <div className="change-log-entry-date">{version.title}</div>
                  <div className="change-log-entry-list-body">
                    {version.sections.map((item) => (
                      <ChangeLogHtmlContent
                        key={item}
                        content={item}
                        className="change-log-entry-item"
                      />
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="change-log-empty-wrap">
              <Empty description="暂无更新日志" image={Empty.PRESENTED_IMAGE_SIMPLE} />
            </div>
          )}
        </div>
      </div>
    </Modal>
  );
};

export default ChangeLogModal;
