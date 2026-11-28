import * as Menubar from "@radix-ui/react-menubar";
import { Check, Layers } from "lucide-react";
import type { ReactNode } from "react";
import type { PlanTool } from "../graphics2d/PlanView2D";
import type { Level } from "../model/Level";
import { panelIds, panelTitles, defaultPanelLayout, type PanelId, type PanelLayout } from "./panelLayout";
import "./MenuBar.css";

export type MenuBarProps = {
  onDownload: () => void;
  onEditSelected?: () => void;
  onDeleteSelected?: () => void;
  onMergeRooms?: () => void;
  onMergeOpenings?: () => void;
  onManageColours: () => void;
  tool?: PlanTool;
  disabledTools: Record<PlanTool, boolean>;
  onToolChange: (tool?: PlanTool) => void;
  layout: PanelLayout;
  onLayoutChange: (layout: PanelLayout) => void;
  lockedPanels: Partial<Record<PanelId, boolean>>;
  levels: Level[];
  activeLevel: number;
  onLevelSelect: (level: number) => void;
};

const Menu = ({ label, children }: { label: string; children: ReactNode }) => (
  <Menubar.Menu>
    <Menubar.Trigger className="menubar-trigger">{label}</Menubar.Trigger>
    <Menubar.Portal>
      <Menubar.Content className="menu-content" align="start" sideOffset={4}>
        {children}
      </Menubar.Content>
    </Menubar.Portal>
  </Menubar.Menu>
);

const Item = ({ onSelect, shortcut, children }: { onSelect?: () => void; shortcut?: string; children: ReactNode }) => (
  <Menubar.Item className="menu-item" disabled={!onSelect} onSelect={onSelect}>
    <span className="menu-item-indicator" />
    {children}
    {shortcut && <span className="menu-item-hint">{shortcut}</span>}
  </Menubar.Item>
);

const CheckItem = ({
  checked,
  disabled,
  onCheckedChange,
  hint,
  children,
}: {
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
  hint?: string;
  children: ReactNode;
}) => (
  <Menubar.CheckboxItem className="menu-item" checked={checked} disabled={disabled} onCheckedChange={onCheckedChange}>
    <span className="menu-item-indicator">
      <Menubar.ItemIndicator>
        <Check size={14} aria-hidden="true" />
      </Menubar.ItemIndicator>
    </span>
    {children}
    {hint && <span className="menu-item-hint">{hint}</span>}
  </Menubar.CheckboxItem>
);

export const MenuBar = ({
  onDownload,
  onEditSelected,
  onDeleteSelected,
  onMergeRooms,
  onMergeOpenings,
  onManageColours,
  tool,
  disabledTools,
  onToolChange,
  layout,
  onLayoutChange,
  lockedPanels,
  levels,
  activeLevel,
  onLevelSelect,
}: MenuBarProps) => {
  const toolItem = (kind: PlanTool, label: string, hint: string) => (
    <CheckItem
      checked={tool === kind}
      disabled={disabledTools[kind]}
      hint={hint}
      onCheckedChange={(checked) => onToolChange(checked ? kind : undefined)}
    >
      {label}
    </CheckItem>
  );
  return (
    <header className="menubar-bar" aria-label="Plan menu">
      <div className="menubar-brand">
        <Layers aria-hidden="true" size={18} strokeWidth={2.4} />
        <span>OpenHome</span>
      </div>
      <Menubar.Root className="menubar">
        <Menu label="File">
          <Item onSelect={onDownload}>Download JSON</Item>
        </Menu>
        <Menu label="Edit">
          <Item onSelect={onEditSelected} shortcut="Enter">
            Edit selected…
          </Item>
          <Item onSelect={onDeleteSelected} shortcut="Del">
            Delete selected
          </Item>
          <Item onSelect={onMergeRooms}>Merge rooms</Item>
          <Item onSelect={onMergeOpenings}>Merge openings</Item>
          <Menubar.Separator className="menu-separator" />
          <Item onSelect={onManageColours}>Colours…</Item>
        </Menu>
        <Menu label="Add">
          {toolItem("wall", "Wall", "click start, end")}
          {toolItem("fence", "Fence", "click start, end")}
          {toolItem("opening", "Opening", "click on a wall")}
        </Menu>
        <Menu label="View">
          <Menubar.Label className="menu-label">Side panels</Menubar.Label>
          {panelIds.map((id) => (
            <CheckItem
              key={id}
              checked={layout[id].open || !!lockedPanels[id]}
              disabled={lockedPanels[id]}
              hint={layout[id].open && layout[id].collapsed ? "minimised" : undefined}
              onCheckedChange={(open) => onLayoutChange({ ...layout, [id]: { ...layout[id], open } })}
            >
              {panelTitles[id]}
            </CheckItem>
          ))}
          <Menubar.Separator className="menu-separator" />
          <Item onSelect={() => onLayoutChange(defaultPanelLayout())}>Reset panel layout</Item>
        </Menu>
      </Menubar.Root>
      <div className="menubar-divider" />
      <div className="level-switcher" role="group" aria-label="Active level">
        <span className="level-switcher-label">Floor</span>
        {levels.map((level, index) => (
          <button
            key={index}
            type="button"
            aria-pressed={level.number === activeLevel}
            onClick={() => onLevelSelect(level.number)}
          >
            {level.name}
          </button>
        ))}
        {levels.length === 0 && <span className="level-switcher-label">No levels</span>}
      </div>
    </header>
  );
};
