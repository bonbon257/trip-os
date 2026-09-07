import { Card, Section } from '@/components/ui';

/**
 * /weekend/checklist —— 周末临时清单
 *
 * 比旅行的清单轻很多：周末出门是「要带啥 / 别忘了啥」。
 * 默认 5 项固定项（身份证/手机/钱包/钥匙/伞），可加自定义项；
 * 数据存储：直接走 store.settings.weekendChecklist 自定义项 + 固定模板渲染。
 *
 * P1 可以替换为 store 的 checklist；目前用 local state（每次刷新重置），
 * 因为周末清单本来就是「临时的」。
 */
const TEMPLATE = [
  { id: 'id', emoji: '🪪', label: '身份证' },
  { id: 'phone', emoji: '📱', label: '手机（充电宝）' },
  { id: 'wallet', emoji: '👛', label: '钱包 / 现金' },
  { id: 'keys', emoji: '🔑', label: '钥匙' },
  { id: 'umbrella', emoji: '☂️', label: '伞（看天气）' },
];

export function WeekendChecklistPage() {
  return (
    <div className="space-y-4">
      <Card className="p-4">
        <p className="text-[11.5px] font-bold tracking-wider text-inkFaint">周末临时清单</p>
        <p className="mt-1 text-[14px] font-bold">出门前看一眼，别到半路才发现没带</p>
        <p className="muted mt-1 text-[12px]">
          周末清单是临时的（每次出门可能不一样），下次出门可重新勾选。
        </p>
      </Card>

      <Section title="默认项" hint="出门前常忘的 5 件">
        <div className="space-y-2">
          {TEMPLATE.map((it) => (
            <Card key={it.id} className="flex items-center gap-3 p-3">
              <span className="grid h-9 w-9 place-items-center rounded-xl border-[1.5px] border-ink/15 bg-paperDeep text-[18px]">
                {it.emoji}
              </span>
              <span className="flex-1 text-[14px] font-bold">{it.label}</span>
              <input
                type="checkbox"
                className="h-5 w-5 cursor-pointer accent-ink"
                aria-label={it.label}
              />
            </Card>
          ))}
        </div>
      </Section>

      <Section title="自定义项" hint="勾上记号，准备出门了">
        <Card className="p-4 text-center">
          <p className="muted text-[12.5px]">
            临时清单故意不存数据 —— 周六日一过，下次出门重新开始最省心。
            <br />
            （需要长留存？下一阶段给清单加 store 项。）
          </p>
        </Card>
      </Section>
    </div>
  );
}