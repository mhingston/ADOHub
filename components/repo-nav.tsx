"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const tabs = [
  { label: "Code", suffix: "" },
  { label: "Pull requests", suffix: "/pulls" },
  { label: "Pipelines", suffix: "/actions" },
  { label: "Branches", suffix: "/branches" },
];

export function RepoNav({ basePath }: { basePath: string }) {
  const pathname = usePathname();
  return (
    <nav className="repo-tabs" aria-label="Repository">
      {tabs.map((tab) => {
        const href = `${basePath}${tab.suffix}`;
        const active = tab.suffix === ""
          ? pathname === basePath || pathname === `${basePath}/tree` || pathname === `${basePath}/blob`
          : pathname === href || pathname.startsWith(`${href}/`) || (tab.suffix === "/pulls" && pathname.startsWith(`${basePath}/pull/`));
        return <Link key={tab.label} className={active ? "repo-tab active" : "repo-tab"} href={href}>{tab.label}</Link>;
      })}
    </nav>
  );
}
