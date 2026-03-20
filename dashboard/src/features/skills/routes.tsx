import { SkillsPage } from "./views/SkillsPage"
import type { NavRouteMeta } from "@/core/navigation"

export const skillsRoute: NavRouteMeta = {
  id: "skills",
  title: "Skills",
  path: "/skills",
  sidebarGroup: "skills",
}

export const skillsRouteElement = <SkillsPage />
