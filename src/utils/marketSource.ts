/** Human-readable label for marketplace item source id. */
export function marketSourceLabel(source?: string): string {
  switch (source) {
    case "cloud":
      return "云市场";
    case "clawhub":
      return "ClawHub";
    case "skillhub":
      return "SkillHub";
    case "github":
    default:
      return "官方";
  }
}
