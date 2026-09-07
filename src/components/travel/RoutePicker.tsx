import { useMemo, useState } from 'react';
import type { Place } from '@/types';
import { Modal, Select, Input, Field, Button, cx } from '@/components/ui';
import { amapNavUrl, type RouteEndpoint } from '@/utils/amap';

export interface RouteInitPoint extends RouteEndpoint {
  placeId?: string;
}

interface Props {
  open: boolean;
  onClose: () => void;
  places: Place[];
  initialFrom?: RouteInitPoint | null;
  initialTo?: RouteInitPoint | null;
  title?: string;
}

const CUSTOM = '__custom__';

/**
 * 选路线 · 叫车弹窗
 * 选起点 / 终点（真实地点或手动输入），内联迷你地图连线预览，
 * 「打车 / 导航」跳高德 URI。无坐标时退回纯名称（高德用当前定位）。
 */
export function RoutePickerModal({ open, onClose, places, initialFrom, initialTo, title }: Props) {
  const placeById = (id?: string) => (id && id !== CUSTOM ? places.find((p) => p.id === id) : undefined);

  const [fromId, setFromId] = useState(initialFrom?.placeId ?? CUSTOM);
  const [fromName, setFromName] = useState(initialFrom?.name ?? '');
  const [toId, setToId] = useState(initialTo?.placeId ?? CUSTOM);
  const [toName, setToName] = useState(initialTo?.name ?? '');

  const fromPlace = placeById(fromId);
  const toPlace = placeById(toId);

  const from: RouteEndpoint | null = useMemo(() => {
    if (fromPlace) return { name: fromPlace.name, lng: fromPlace.lng, lat: fromPlace.lat };
    const n = fromName.trim();
    return n ? { name: n } : null;
  }, [fromPlace, fromName]);

  const to: RouteEndpoint | null = useMemo(() => {
    if (toPlace) return { name: toPlace.name, lng: toPlace.lng, lat: toPlace.lat };
    const n = toName.trim();
    return n ? { name: n } : null;
  }, [toPlace, toName]);

  const url = useMemo(() => (to ? amapNavUrl(from, to) : ''), [from, to]);

  // 迷你地图：两端都是真实地点且有画布坐标时连线
  const box = useMemo(() => {
    const pts = [fromPlace, toPlace].filter((p): p is Place => !!p && p.x != null && p.y != null);
    if (pts.length < 2) return null;
    const pad = 16;
    const minX = Math.min(...pts.map((p) => p.x)) - pad;
    const minY = Math.min(...pts.map((p) => p.y)) - pad;
    const size = Math.max(
      Math.max(...pts.map((p) => p.x)) + pad - minX,
      Math.max(...pts.map((p) => p.y)) + pad - minY,
      40,
    );
    return `${minX} ${minY} ${size} ${size}`;
  }, [fromPlace, toPlace]);

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title ?? '选择路线 · 叫车'}
      footer={
        <>
          <Button onClick={onClose}>取消</Button>
          <a
            href={url || undefined}
            target="_blank"
            rel="noopener noreferrer"
            onClick={url ? undefined : (e) => e.preventDefault()}
            className={cx(
              'focus-ring inline-flex items-center justify-center rounded-lg px-3 py-1.5 text-[12.5px] font-bold transition',
              url
                ? 'border-[1.5px] border-azure bg-azure text-white hover:opacity-90'
                : 'pointer-events-none rounded-lg border-[1.5px] border-ink/15 px-3 py-1.5 text-[12.5px] font-semibold text-inkFaint opacity-50',
            )}
          >
            🚕 打车（高德）
          </a>
        </>
      }
    >
      <div className="space-y-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="起点">
            <Select
              value={fromId}
              onChange={(e) => {
                const id = e.target.value;
                setFromId(id);
                const p = placeById(id);
                if (p) setFromName(p.name);
              }}
            >
              <option value={CUSTOM}>✍️ 手动输入起点</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                  {p.lng != null ? ' 📍' : ''}
                </option>
              ))}
            </Select>
            {fromId === CUSTOM && (
              <Input
                className="mt-2"
                value={fromName}
                onChange={(e) => setFromName(e.target.value)}
                placeholder="如深圳宝安机场"
              />
            )}
          </Field>

          <Field label="终点">
            <Select
              value={toId}
              onChange={(e) => {
                const id = e.target.value;
                setToId(id);
                const p = placeById(id);
                if (p) setToName(p.name);
              }}
            >
              <option value={CUSTOM}>✍️ 手动输入终点</option>
              {places.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.emoji} {p.name}
                  {p.lng != null ? ' 📍' : ''}
                </option>
              ))}
            </Select>
            {toId === CUSTOM && (
              <Input
                className="mt-2"
                value={toName}
                onChange={(e) => setToName(e.target.value)}
                placeholder="如大理古城某酒店"
              />
            )}
          </Field>
        </div>

        {/* 迷你路线预览 */}
        <div className="overflow-hidden rounded-card border-[1.5px] border-ink bg-[#F6F3EA]">
          {box ? (
            <svg viewBox={box} className="h-44 w-full" role="img" aria-label="路线预览">
              <defs>
                <pattern id="rp-grid" width="6" height="6" patternUnits="userSpaceOnUse">
                  <path d="M6 0 L0 0 0 6" fill="none" stroke="rgba(17,17,17,0.06)" strokeWidth="0.3" />
                </pattern>
              </defs>
              <rect x="-200" y="-200" width="600" height="600" fill="url(#rp-grid)" />
              <line
                x1={fromPlace!.x}
                y1={fromPlace!.y}
                x2={toPlace!.x}
                y2={toPlace!.y}
                stroke="#111111"
                strokeWidth="0.9"
                strokeLinecap="round"
                strokeDasharray="2.4 1.6"
                opacity="0.55"
              />
              <circle cx={fromPlace!.x} cy={fromPlace!.y} r="3.2" fill="#16A34A" stroke="#fff" strokeWidth="0.8" />
              <circle cx={toPlace!.x} cy={toPlace!.y} r="3.2" fill="#E11D48" stroke="#fff" strokeWidth="0.8" />
            </svg>
          ) : (
            <div className="flex h-44 flex-col items-center justify-center gap-2 px-4 text-center">
              <p className="text-[18px]">🗺️</p>
              <p className="text-[12px] text-inkFaint">
                两端都选「真实地点」时，这里会显示路线连线。
                <br />
                当前将直接把名称交给高德规划。
              </p>
            </div>
          )}
        </div>

        <div className="flex items-center justify-between gap-2 text-[12px]">
          <span className="text-inkFaint">
            起点：<b className="text-inkSoft">{from?.name || '当前位置'}</b>
          </span>
          <span className="text-inkFaint">
            终点：<b className="text-inkSoft">{to?.name || '未选择'}</b>
          </span>
        </div>

        <p className="text-[11.5px] text-inkFaint">
          点击「打车（高德）」会打开高德 App / 网页，自动填入起终点并可直接呼叫网约车。
        </p>
      </div>
    </Modal>
  );
}
