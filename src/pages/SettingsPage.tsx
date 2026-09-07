import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStore } from '@/services/store';
import { PageHeader } from '@/components/layout';
import { Button, Card, Field, Input, Modal, Select, Tag, cx, toast } from '@/components/ui';
import { ORIGINS } from '@/data/taxonomy';
import { ApiKeyCard } from '@/features/settings/ApiKeyCard';

export function SettingsPage() {
  const navigate = useNavigate();
  const settings = useStore((s) => s.settings);
  const updateSettings = useStore((s) => s.updateSettings);
  const resetAll = useStore((s) => s.resetAll);
  const tripCount = useStore((s) => s.db.trips.length);

  const [confirmReset, setConfirmReset] = useState(false);

  return (
    <div className="space-y-4">
      <PageHeader title="设置" subtitle="只是一些会影响推荐和提醒的基础信息。" />

      <ApiKeyCard />

      <Card className="space-y-4 p-5">
        <Field label="怎么称呼你">
          <Input
            value={settings.name}
            onChange={(e) => updateSettings({ name: e.target.value })}
            placeholder="旅行者"
          />
        </Field>
        <Field label="常住城市" hint="推荐目的地时会用它估算交通成本和时间">
          <Select
            value={settings.homeCity}
            onChange={(e) => updateSettings({ homeCity: e.target.value })}
          >
            {ORIGINS.map((o) => (
              <option key={o.name} value={o.name}>
                {o.name}
              </option>
            ))}
          </Select>
        </Field>
      </Card>

      <Card className="p-5">
        <p className="h3">智能提醒</p>
        <div className="mt-3 space-y-3">
          <Toggle
            label="强度提示"
            desc="连续两天高强度时提醒你留白。"
            value={settings.showIntensityHints}
            onChange={(v) => updateSettings({ showIntensityHints: v })}
          />
          <div className="flex items-start justify-between gap-3 rounded-xl border-[1.5px] border-ink/12 bg-paperDeep px-3.5 py-3">
            <div className="min-w-0">
              <p className="text-[13.5px] font-bold">高危操作必须确认</p>
              <p className="text-[11.5px] text-inkSoft">
                删除行程、改预算、改日期这类操作永远需要你点确认。这项不能关。
              </p>
            </div>
            <Tag tone="rose">始终开启</Tag>
          </div>
        </div>
      </Card>

      <Card className="p-5">
        <p className="h3">数据</p>
        <p className="muted mt-1">
          所有数据保存在这台设备的浏览器里（localStorage）。清空后会恢复到演示用的示例旅行。
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="danger" onClick={() => setConfirmReset(true)}>
            重置为示例数据
          </Button>
          <span className="text-[11.5px] text-inkFaint">当前有 {tripCount} 次旅行</span>
        </div>
      </Card>

      <Card className="p-5">
        <p className="h3">关于 Trip OS</p>
        <p className="muted mt-1">
          不知道去哪的时候帮你做决定，知道去哪的时候帮你规划，不想规划的时候替你规划，计划变了的时候帮你重新安排。
        </p>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {['Decision', 'Planning', 'Execution', 'Memory'].map((t) => (
            <Tag key={t} tone="violet">
              {t}
            </Tag>
          ))}
        </div>
        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => navigate('/quiz')}>
            重新做一次测评
          </Button>
          <Button size="sm" onClick={() => navigate('/')}>
            回首页
          </Button>
        </div>
      </Card>

      <Modal
        open={confirmReset}
        onClose={() => setConfirmReset(false)}
        title="重置为示例数据？"
        footer={
          <>
            <Button onClick={() => setConfirmReset(false)}>取消</Button>
            <Button
              variant="danger"
              onClick={() => {
                resetAll();
                setConfirmReset(false);
                toast('已恢复示例数据', 'good');
                navigate('/');
              }}
            >
              确认重置
            </Button>
          </>
        }
      >
        <p className="muted">当前所有旅行、行程、预算和清单都会被清除，无法恢复。</p>
      </Modal>
    </div>
  );
}

function Toggle({
  label,
  desc,
  value,
  onChange,
}: {
  label: string;
  desc: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-start justify-between gap-3 rounded-xl border-[1.5px] border-ink/12 px-3.5 py-3">
      <div className="min-w-0">
        <p className="text-[13.5px] font-bold">{label}</p>
        <p className="text-[11.5px] text-inkSoft">{desc}</p>
      </div>
      <button
        onClick={() => onChange(!value)}
        className={cx(
          'focus-ring relative h-6 w-11 shrink-0 rounded-full border-[1.5px] border-ink transition',
          value ? 'bg-moss/30' : 'bg-white',
        )}
        aria-label={value ? '关闭' : '开启'}
      >
        <span
          className={cx(
            'absolute top-[2px] h-4 w-4 rounded-full border-[1.5px] border-ink bg-white transition-all',
            value ? 'left-[24px]' : 'left-[2px]',
          )}
        />
      </button>
    </div>
  );
}
