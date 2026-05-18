import { useState } from 'react';
import { ChartTheme } from '../themes/themes';
import { SidebarTab } from '@/app/profile/profilecomponents';
import { ColorPicker } from './ColorPicker';


type Tab = "trading" | "chart" | "positions";
const TABS: { key: Tab; label: string }[] = [
  { key: "trading", label: "Trading" },
  { key: "chart",   label: "Chart"   },
  { key: "positions",  label: "Open Positions"  },
];


export const ChartThemeModal: React.FC<{
  isCandle: boolean;
  theme: ChartTheme;
  onSave: (overrides: Partial<ChartTheme>) => void;
  onClose: () => void;
  
}> = ({ isCandle, theme, onSave, onClose }) => {
  const [draft, setDraft] = useState<Partial<ChartTheme>>({});
  const [activeTab, setActiveTab] = useState("chart");

  function handleTabClick(tab: Tab) {
      setActiveTab(tab);
    }

  const set = (key: keyof ChartTheme, value: any) => {
    console.log("set called:", key, value);

    setDraft(prev => ({ ...prev, [key]: value }));
  }

  const merged = { ...theme, ...draft };

  return (
  <div
    className="fixed inset-0 z-50 flex items-center justify-center bg-black/60"
    onClick={onClose}
  >
    <div
      className="bg-[#222222] text-white rounded-xl p-6 w-160 flex"
      onClick={(e) => e.stopPropagation()}
    >
      {/* SIDEBAR */}
      <div className="w-36 flex flex-col border-r border-black/20 dark:border-white/10 pr-4 gap-6">
        <div className="flex flex-col w-full gap-2 text-white">
          {["trading", "chart", "positions"].map((tab) => (
            <SidebarTab
              key={tab}
              label={tab.charAt(0).toUpperCase() + tab.slice(1)}
              active={activeTab === tab}
              onClick={() => setActiveTab(tab)}
            />
          ))}
        </div>
      </div>

      {/* MAIN CONTENT */}
      <div className="flex-1 pl-4 flex flex-col gap-4">
        {activeTab === "chart" && (
          <>
            <h2 className="text-sm font-semibold tracking-wide uppercase text-gray-200 border-b border-[#00000020] pb-2">
              Chart Theme
            </h2>

            <Row label="Background">
              <div className="flex items-center gap-2">
                {/* Type toggle */}
                <select
                  className="bg-white/6 border border-white/12 rounded-md text-white/80 text-[11px] px-2 py-1 focus:outline-none"
                  value={merged.background.type}
                  onChange={e => {
                    const t = e.target.value;
                    if (t === 'solid')       set('background', { type: 'solid', color: '#000000' });
                    if (t === 'gradient')    set('background', { type: 'gradient', topColor: '#1d2129', bottomColor: '#0a0e14' });
                    if (t === 'transparent') set('background', { type: 'transparent' });
                  }}
                  >
                    <option value="solid">Solid</option>
                    <option value="gradient">Gradient</option>
                    <option value="transparent">None</option>
                  </select>

                  {/* Solid */}
                  {merged.background.type === 'solid' && (
                    <div className="relative w-17 h-7 rounded border border-white/15">
                      <div className="absolute inset-0 rounded" style={{ background: merged.background.color }} />
                      <ColorPicker value={merged.background.color} onChange={v => set('background', { type: 'solid', color: v })} />
                    </div>
                  )}

                  {/* Gradient — top color → bottom color */}
                  {merged.background.type === 'gradient' && (
                    <div className="flex items-center gap-1.5">
                      <div className="relative w-7 h-7 rounded border border-white/15">
                        <div className="absolute inset-0 rounded" style={{ background: merged.background.topColor }} />
                        <ColorPicker value={merged.background.topColor} onChange={v => set('background', { ...merged.background, topColor: v })} />
                      </div>
                      <span className="text-white/30 text-xs">→</span>
                      <div className="relative w-7 h-7 rounded border border-white/15">
                        <div className="absolute inset-0 rounded" style={{ background: merged.background.bottomColor }} />
                        <ColorPicker value={merged.background.bottomColor} onChange={v => set('background', { ...merged.background, bottomColor: v })}/>
                  </div>
                </div>
              )}
              </div>
            </Row>

            <Row label="Text">
              <div className="flex gap-2">
                <div className="relative w-17 h-7 rounded overflow-hidden border border-white/15">
                  <div className="absolute inset-0" style={{ background: merged.text }} />
                  <ColorPicker value={merged.text} onChange={v => set('text', v)} />
                </div>
              </div>
            </Row>

            <Row label="Grid">
              <div className="flex gap-2">
                <div className="relative w-17 h-7 rounded overflow-hidden border border-white/15">
                  <div className="absolute inset-0" style={{ background: merged.grid }} />
                  <ColorPicker value={merged.grid} onChange={v => set('grid', v)} />
                </div>
              </div>
            </Row>

            <Row label="Crosshair">
              <div className="flex gap-2">
                <div className="relative w-17 h-7 rounded overflow-hidden border border-white/15">
                  <div className="absolute inset-0" style={{ background: merged.crosshair }} />
                  <ColorPicker value={merged.crosshair} onChange={v => set('crosshair', v)} />
                </div>
              </div>
            </Row>

            {isCandle ? (
              <>
                <Row label="Candle">
                    <div className="flex gap-2">
                        <div className="relative w-7 h-7 rounded overflow-hidden border border-white/15">
                            <div className="absolute inset-0" style={{ background: merged.bullCandle }} />
                            <ColorPicker value={merged.bullCandle} onChange={v => set('bullCandle', v)} />
                        </div>
                        <div className="relative w-7 h-7 rounded overflow-hidden border border-white/15">
                            <div className="absolute inset-0" style={{ background: merged.bearCandle }} />
                            <ColorPicker value={merged.bearCandle} onChange={v => set('bearCandle', v)} /> 
                        </div>
                    </div>
                </Row>

                <Row label="Border">
                    <div className="flex gap-2">
                        <div className="relative w-7 h-7 rounded overflow-hidden border border-white/15">
                            <div className="absolute inset-0" style={{ background: merged.borderUpColor }} />
                            <ColorPicker value={merged.borderUpColor} onChange={v => set('borderUpColor', v)} />
                        </div>
                        <div className="relative w-7 h-7 rounded overflow-hidden border border-white/15">
                            <div className="absolute inset-0" style={{ background: merged.borderDownColor }} />
                            <ColorPicker value={merged.borderDownColor} onChange={v => set('borderDownColor', v)} /> 
                        </div>
                    </div>
                </Row>

                <Row label="Wick">
                    <div className="flex gap-2">
                        <div className="relative w-7 h-7 rounded overflow-hidden border border-white/15">
                            <div className="absolute inset-0" style={{ background: merged.wickUpColor }} />
                            <ColorPicker value={merged.wickUpColor} onChange={v => set('wickUpColor', v)} />
                        </div>
                        <div className="relative w-7 h-7 rounded overflow-hidden border border-white/15">
                            <div className="absolute inset-0" style={{ background: merged.wickDownColor }} />
                            <ColorPicker value={merged.wickDownColor} onChange={v => set('wickDownColor', v)} /> 
                        </div>
                    </div>
                </Row>


                <Row label="Positions">
                    <div className="flex gap-2">
                        <div className="relative w-7 h-7 rounded overflow-hidden border border-white/15">
                            <div className="absolute inset-0" style={{ background: merged.longPosition }} />
                            <ColorPicker value={merged.longPosition} onChange={v => set('longPosition', v)} />
                        </div>
                        <div className="relative w-7 h-7 rounded overflow-hidden border border-white/15">
                            <div className="absolute inset-0" style={{ background: merged.shortPosition }} />
                            <ColorPicker value={merged.shortPosition} onChange={v => set('shortPosition', v)} /> 
                        </div>
                    </div>
                </Row>
              </>
            ) : (
              <>
                <Row label="Line Up">
                  <input
                    type="color"
                    value={merged.lineUp}
                    onChange={(e) => set("lineUp", e.target.value)}
                  />
                </Row>

                <Row label="Line Down">
                  <input
                    type="color"
                    value={merged.lineDown}
                    onChange={(e) => set("lineDown", e.target.value)}
                  />
                </Row>

                <Row label="Area Top Up">
                  <input
                    type="color"
                    value={merged.areaTopUp}
                    onChange={(e) => set("areaTopUp", e.target.value)}
                  />
                </Row>

                <Row label="Area Top Down">
                  <input
                    type="color"
                    value={merged.areaTopDown}
                    onChange={(e) => set("areaTopDown", e.target.value)}
                  />
                </Row>

                <Row label="Area Bottom Up">
                  <input
                    type="color"
                    value={merged.areaBottomUp}
                    onChange={(e) => set("areaBottomUp", e.target.value)}
                  />
                </Row>

                <Row label="Area Bottom Down">
                  <input
                    type="color"
                    value={merged.areaBottomDown}
                    onChange={(e) => set("areaBottomDown", e.target.value)}
                  />
                </Row>
              </>
            )}

            <div className="flex gap-2 mt-2">
              <button
                className="flex-1 py-2 rounded-lg bg-gray-700 text-sm"
                onClick={onClose}
              >
                Cancel
              </button>

              <button
                className="flex-1 py-2 rounded-lg bg-blue-600 text-sm font-semibold"
                onClick={() => {
                  console.log("draft:", draft);
                  onSave(draft);
                  onClose();
                }}
              >
                Save
              </button>
            </div>
          </>
        )}

        {activeTab !== "chart" && (
          <div className="text-sm text-zinc-400">
            No settings for this tab yet.
          </div>
        )}
      </div>
    </div>
  </div>
);
};

export const Row: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div className="flex items-center justify-between">
    <span className="text-sm text-gray-300">{label}</span>
    {children}
  </div>
);