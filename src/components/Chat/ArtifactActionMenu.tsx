import { useCallback, useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { Copy, ExternalLink, FolderOpen } from "lucide-react";
import { openWithPath, revealPath } from "../../services/tauri";

type ArtifactMenuState = {
  x: number;
  y: number;
  path: string;
};

export function useArtifactActionMenu(): {
  openArtifactMenu: (event: MouseEvent, path: string) => void;
  artifactActionMenu: ReactNode;
} {
  const [menu, setMenu] = useState<ArtifactMenuState | null>(null);

  const closeMenu = useCallback(() => setMenu(null), []);

  const openArtifactMenu = useCallback((event: MouseEvent, path: string) => {
    event.preventDefault();
    event.stopPropagation();
    setMenu({ x: event.clientX, y: event.clientY, path });
  }, []);

  useEffect(() => {
    if (!menu) return;
    const close = () => closeMenu();
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeMenu();
    };
    window.addEventListener("click", close);
    window.addEventListener("resize", close);
    window.addEventListener("blur", close);
    window.addEventListener("scroll", close, true);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("click", close);
      window.removeEventListener("resize", close);
      window.removeEventListener("blur", close);
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, menu]);

  const runAction = (action: () => Promise<void>) => (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    void action().catch(console.error);
    closeMenu();
  };

  const artifactActionMenu = menu ? (
    <div
      className="artifact-action-menu"
      style={{ left: menu.x, top: menu.y }}
      role="menu"
      onClick={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      <button type="button" role="menuitem" onClick={runAction(() => openWithPath(menu.path))}>
        <ExternalLink size={14} strokeWidth={1.8} />
        <span>打开方式</span>
      </button>
      <button type="button" role="menuitem" onClick={runAction(() => navigator.clipboard.writeText(menu.path))}>
        <Copy size={14} strokeWidth={1.8} />
        <span>复制路径</span>
      </button>
      <button type="button" role="menuitem" onClick={runAction(() => revealPath(menu.path))}>
        <FolderOpen size={14} strokeWidth={1.8} />
        <span>在资源管理器中打开</span>
      </button>
    </div>
  ) : null;

  return { openArtifactMenu, artifactActionMenu };
}
