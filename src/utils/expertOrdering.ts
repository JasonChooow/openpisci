const DEPARTMENT_ORDER: Record<string, number> = {
  "\u8bbe\u8ba1\u90e8": 10,
  "\u8425\u9500\u90e8": 20,
  "\u5f00\u53d1\u90e8": 30,
  "\u4ea7\u54c1\u90e8": 40,
  "\u9879\u76ee\u7ba1\u7406\u90e8": 50,
  "\u9500\u552e\u90e8": 60,
  "\u91d1\u878d\u90e8": 70,
  "\u6cd5\u52a1\u90e8": 80,
  "\u4eba\u529b\u8d44\u6e90\u90e8": 90,
  "\u4f9b\u5e94\u94fe\u90e8": 100,
  "\u652f\u6301\u90e8": 110,
  "\u5b89\u5168\u90e8": 120,
  "\u6d4b\u8bd5\u90e8": 130,
  "\u5b66\u672f\u90e8": 900,
};

const SUBCATEGORY_ORDER: Record<string, number> = {
  "\u56fd\u5185\u5e73\u53f0": 10,
  "\u51fa\u6d77\u8425\u9500": 20,
  "\u5e7f\u544a\u6295\u653e": 30,
  "\u901a\u7528": 40,
  "Unity": 50,
  "Unreal Engine": 60,
  "Blender": 70,
  "Godot": 80,
  "Roblox Studio": 90,
};

export function normalizeExpertGroupLabel(label?: string | null): string {
  const raw = (label ?? "").trim();
  if (!raw) return "\u5176\u4ed6\u4e13\u5bb6";
  const parts = raw.split("/").map((part) => part.trim()).filter(Boolean);
  const department = normalizeDepartment(parts[0] ?? raw);
  const subcategory = parts[1];
  return subcategory ? `${department} / ${subcategory}` : department;
}

export function compareExpertGroupLabels(a: string, b: string): number {
  const pa = splitGroup(normalizeExpertGroupLabel(a));
  const pb = splitGroup(normalizeExpertGroupLabel(b));
  const da = DEPARTMENT_ORDER[pa.department] ?? 800;
  const db = DEPARTMENT_ORDER[pb.department] ?? 800;
  if (da !== db) return da - db;
  const sa = SUBCATEGORY_ORDER[pa.subcategory] ?? 500;
  const sb = SUBCATEGORY_ORDER[pb.subcategory] ?? 500;
  if (sa !== sb) return sa - sb;
  return a.localeCompare(b, "zh-Hans-CN");
}

function normalizeDepartment(department: string): string {
  if (department === "\u5de5\u7a0b\u90e8" || department === "\u6e38\u620f\u5f00\u53d1\u90e8") {
    return "\u5f00\u53d1\u90e8";
  }
  if (department === "\u4ed8\u8d39\u5a92\u4f53\u90e8") {
    return "\u8425\u9500\u90e8";
  }
  return department;
}

function splitGroup(group: string): { department: string; subcategory: string } {
  const [department, subcategory = ""] = group.split("/").map((part) => part.trim());
  return { department, subcategory };
}
