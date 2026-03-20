import type { Table as ReactTable, ColumnDef } from "@tanstack/react-table"
import { flexRender } from "@tanstack/react-table"
import type { SkillSummary } from "@/lib/api"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { Search } from "lucide-react"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"

interface InstalledSkillsTabProps {
  skills: SkillSummary[]
  installedSearch: string
  setInstalledSearch: (value: string) => void
  installingSystem: boolean
  onInstallDefaultSkills: () => void | Promise<void>
  skillsTable: ReactTable<SkillSummary>
  skillColumns: ColumnDef<SkillSummary>[]
}

export function InstalledSkillsTab({
  skills,
  installedSearch,
  setInstalledSearch,
  installingSystem,
  onInstallDefaultSkills,
  skillsTable,
  skillColumns,
}: InstalledSkillsTabProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Installed skills</CardTitle>
        <CardDescription>
          You can find and install more skills from the SulalaHub store.{" "}
          <a href="https://hub.sulala.ai" className="text-blue-500" target="_blank" rel="noopener noreferrer">
            Visit the store
          </a>{" "}
          to find and install skills.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {skills.length === 0 ? (
          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              No skills installed. Install default skills (memory, date, fetch, jq, file-search) or use Install
              skill to add one.
            </p>
            <Button variant="secondary" size="sm" onClick={onInstallDefaultSkills} disabled={installingSystem}>
              {installingSystem ? "Installing…" : "Install default skills"}
            </Button>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="relative max-w-sm">
              <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search by name, id, or description"
                value={installedSearch}
                onChange={(e) => setInstalledSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  {skillsTable.getHeaderGroups().map((headerGroup) => (
                    <TableRow key={headerGroup.id}>
                      {headerGroup.headers.map((header) => (
                        <TableHead key={header.id}>
                          {header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())}
                        </TableHead>
                      ))}
                    </TableRow>
                  ))}
                </TableHeader>
                <TableBody>
                  {skillsTable.getRowModel().rows?.length ? (
                    skillsTable.getRowModel().rows.map((row) => (
                      <TableRow key={row.id} data-state={row.getIsSelected() && "selected"}>
                        {row.getVisibleCells().map((cell) => (
                          <TableCell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</TableCell>
                        ))}
                      </TableRow>
                    ))
                  ) : (
                    <TableRow>
                      <TableCell colSpan={skillColumns.length} className="h-24 text-center text-muted-foreground">
                        {installedSearch.trim() ? "No skills match your search." : "No skills."}
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  )
}
