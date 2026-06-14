import { Bot, Cloud, Dna, Globe, Landmark, ShoppingCart, Zap } from "lucide-react";

export type SkillPanelTab =
  | "local"
  | "evolution"
  | "openpisci"
  | "hub"
  | "skillhub"
  | "official"
  | "openai";

export function SkillMarketTabIcon({ tab }: { tab: SkillPanelTab }) {
  const props = { size: 14, strokeWidth: 1.75, className: "tab-icon" };
  switch (tab) {
    case "local":
      return <Zap {...props} />;
    case "evolution":
      return <Dna {...props} />;
    case "openpisci":
      return <Cloud {...props} />;
    case "hub":
      return <ShoppingCart {...props} />;
    case "skillhub":
      return <Globe {...props} />;
    case "official":
      return <Landmark {...props} />;
    case "openai":
      return <Bot {...props} />;
    default:
      return null;
  }
}

export function skillTabLabelKey(tab: SkillPanelTab): string {
  switch (tab) {
    case "local":
      return "skills.tabLocal";
    case "evolution":
      return "skills.tabEvolution";
    case "openpisci":
      return "skills.tabOpenpisci";
    case "hub":
      return "skills.tabHub";
    case "skillhub":
      return "skills.tabSkillhub";
    case "official":
      return "skills.tabOfficial";
    case "openai":
      return "skills.tabOpenai";
    default:
      return "skills.tabLocal";
  }
}
