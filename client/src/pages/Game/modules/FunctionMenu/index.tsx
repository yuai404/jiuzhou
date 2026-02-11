import { Badge, Button, Drawer, Tooltip } from 'antd';
import {
  BookOutlined,
  CompassOutlined,
  TeamOutlined,
  ShopOutlined,
  EnvironmentOutlined,
  UserOutlined,
  InboxOutlined,
  ProfileOutlined,
  CreditCardOutlined,
  SafetyCertificateOutlined,
  BarChartOutlined,
  TrophyOutlined,
  CrownOutlined,
  AppstoreOutlined,
  ExperimentOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { useEffect, useMemo, useState } from 'react';
import './index.scss';

interface MenuItem {
  key: string;
  icon: React.ReactNode;
  label: string;
  onClick?: () => void;
}

interface FunctionMenuProps {
  onAction?: (key: string) => void;
  indicators?: Record<
    string,
    {
      badgeCount?: number;
      badgeDot?: boolean;
      tooltip?: string;
    }
  >;
}

const FunctionMenu: React.FC<FunctionMenuProps> = ({ onAction, indicators }) => {
  const [isMobile, setIsMobile] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const getIndicatorTooltip = (key: string): string | undefined => {
    if (isMobile) return undefined;
    return indicators?.[key]?.tooltip || undefined;
  };
  const menuItems: MenuItem[] = useMemo(() => {
    const items: MenuItem[] = [
      { key: 'map', icon: <EnvironmentOutlined />, label: '地图' },
      { key: 'dungeon', icon: <CompassOutlined />, label: '秘境' },
      { key: 'bag', icon: <InboxOutlined />, label: '背包' },
      { key: 'technique', icon: <BookOutlined />, label: '功法' },
      { key: 'realm', icon: <ExperimentOutlined />, label: '境界' },
      { key: 'life', icon: <ToolOutlined />, label: '百业' },
      { key: 'task', icon: <ProfileOutlined />, label: '任务' },
      { key: 'sect', icon: <TeamOutlined />, label: '宗门' },
      { key: 'market', icon: <ShopOutlined />, label: '坊市' },
      { key: 'team', icon: <TeamOutlined />, label: '组队' },
      { key: 'monthcard', icon: <CreditCardOutlined />, label: '月卡' },
      { key: 'battlepass', icon: <SafetyCertificateOutlined />, label: '战令' },
      { key: 'arena', icon: <TrophyOutlined />, label: '竞技' },
      { key: 'rank', icon: <BarChartOutlined />, label: '排行' },
      { key: 'achievement', icon: <CrownOutlined />, label: '成就' },
    ];
    if (isMobile) {
      items.push({ key: 'character', icon: <UserOutlined />, label: '角色' });
    }
    return items;
  }, [isMobile]);

  const handleClick = (key: string) => {
    onAction?.(key);
  };

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const apply = () => setIsMobile(mq.matches);
    apply();
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, []);

  const mobilePrimaryCount = 4;
  const { primaryItems, overflowItems } = useMemo(() => {
    if (!isMobile) return { primaryItems: menuItems, overflowItems: [] as MenuItem[] };
    const hasOverflow = menuItems.length > mobilePrimaryCount;
    const primary = hasOverflow ? menuItems.slice(0, mobilePrimaryCount) : menuItems;
    const overflow = hasOverflow ? menuItems.slice(mobilePrimaryCount) : [];
    return { primaryItems: primary, overflowItems: overflow };
  }, [isMobile, menuItems]);

  return (
    <>
      <div className={`function-menu ${isMobile ? 'is-mobile' : ''}`}>
        <div className="menu-list">
          {primaryItems.map((item) => (
            <Tooltip key={item.key} title={getIndicatorTooltip(item.key)}>
              <Button
                className={`menu-item ${isMobile ? 'mobile-item' : ''}`}
                type={isMobile ? 'text' : 'default'}
                onClick={() => handleClick(item.key)}
              >
                <span className="menu-item-icon">
                  <Badge
                    count={indicators?.[item.key]?.badgeCount}
                    dot={indicators?.[item.key]?.badgeDot}
                    size="small"
                    overflowCount={99}
                    offset={[-2, 2]}
                  >
                    {item.icon}
                  </Badge>
                </span>
                <span className="menu-item-label">{item.label}</span>
              </Button>
            </Tooltip>
          ))}
          {isMobile && overflowItems.length > 0 ? (
            <Button className="menu-item mobile-item" type="text" onClick={() => setMoreOpen(true)}>
              <span className="menu-item-icon">
                <AppstoreOutlined />
              </span>
              <span className="menu-item-label">更多</span>
            </Button>
          ) : null}
        </div>
      </div>

      {isMobile ? (
        <Drawer
          open={moreOpen}
          placement="bottom"
          size="large"
          onClose={() => setMoreOpen(false)}
          closeIcon={null}
          title={null}
          styles={{ wrapper: { height: '60vh' }, body: { padding: 12 } }}
        >
          <div className="menu-more-grid">
            {overflowItems.map((item) => (
              <Tooltip key={item.key} title={getIndicatorTooltip(item.key)}>
                <Button
                  className="menu-more-item"
                  onClick={() => {
                    setMoreOpen(false);
                    handleClick(item.key);
                  }}
                >
                  <span className="menu-more-icon">
                    <Badge
                      count={indicators?.[item.key]?.badgeCount}
                      dot={indicators?.[item.key]?.badgeDot}
                      size="small"
                      overflowCount={99}
                      offset={[-2, 2]}
                    >
                      {item.icon}
                    </Badge>
                  </span>
                  <span className="menu-more-label">{item.label}</span>
                </Button>
              </Tooltip>
            ))}
          </div>
        </Drawer>
      ) : null}
    </>
  );
};

export default FunctionMenu;
