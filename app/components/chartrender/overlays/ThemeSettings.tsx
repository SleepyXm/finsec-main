import { useState } from 'react';
import { ChartTheme } from '../themes/themes';

export const ChartThemeModal: React.FC<{
  isCandle: boolean;
  theme: ChartTheme;
  onSave: (overrides: Partial<ChartTheme>) => void;
  onClose: () => void;
}> = ({ isCandle, theme, onSave, onClose }) => {
  const [draft, setDraft] = useState<Partial<ChartTheme>>({});

  const set = (key: keyof ChartTheme, value: any) => {
    console.log("set called:", key, value);

    setDraft(prev => ({ ...prev, [key]: value }));
  }

  const merged = { ...theme, ...draft };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div className="bg-[#1e2d40] text-white rounded-xl p-6 w-96 flex flex-col gap-4" onClick={e => e.stopPropagation()}>
        <h2 className="text-sm font-semibold tracking-wide uppercase text-gray-400">Chart Theme</h2>

        <Row label="Background">
          <input type="color"
            value={merged.background.type === 'solid' ? merged.background.color : '#000000'}
            onChange={e => set('background', { type: 'solid', color: e.target.value })}
          />
        </Row>

        <Row label="Text">
          <input type="color" value={merged.text} onChange={e => set('text', e.target.value)} />
        </Row>

        <Row label="Grid">
          <input type="color" value={merged.grid} onChange={e => set('grid', e.target.value)} />
        </Row>

        <Row label="Crosshair">
          <input type="color" value={merged.crosshair} onChange={e => set('crosshair', e.target.value)} />
        </Row>

        {isCandle ? (
          <>
            <Row label="Bull Candle">
              <input type="color" value={merged.bullCandle} onChange={e => set('bullCandle', e.target.value)} />
            </Row>
            <Row label="Bear Candle">
              <input type="color" value={merged.bearCandle} onChange={e => set('bearCandle', e.target.value)} />
            </Row>
            <Row label="Long Position">
              <input type="color" value={merged.longPosition} onChange={e => set('longPosition', e.target.value)} />
            </Row>
            <Row label="Short Position">
              <input type="color" value={merged.shortPosition} onChange={e => set('shortPosition', e.target.value)} />
            </Row>
          </>
        ) : (
          <>
            <Row label="Line Up">
              <input type="color" value={merged.lineUp} onChange={e => set('lineUp', e.target.value)} />
            </Row>
            <Row label="Line Down">
              <input type="color" value={merged.lineDown} onChange={e => set('lineDown', e.target.value)} />
            </Row>
            <Row label="Area Top Up">
              <input type="color" value={merged.areaTopUp} onChange={e => set('areaTopUp', e.target.value)} />
            </Row>
            <Row label="Area Top Down">
              <input type="color" value={merged.areaTopDown} onChange={e => set('areaTopDown', e.target.value)} />
            </Row>
            <Row label="Area Bottom Up">
              <input type="color" value={merged.areaBottomUp} onChange={e => set('areaBottomUp', e.target.value)} />
            </Row>
            <Row label="Area Bottom Down">
              <input type="color" value={merged.areaBottomDown} onChange={e => set('areaBottomDown', e.target.value)} />
            </Row>
          </>
        )}

        <div className="flex gap-2 mt-2">
          <button className="flex-1 py-2 rounded-lg bg-gray-700 text-sm" onClick={onClose}>Cancel</button>
          <button className="flex-1 py-2 rounded-lg bg-blue-600 text-sm font-semibold" onClick={() => { console.log("draft:", draft); onSave(draft); onClose(); }}>Save</button>
        </div>
      </div>
    </div>
  );
};

const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-300">{label}</span>
    {children}
  </div>
);