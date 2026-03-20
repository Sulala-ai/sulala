import { Button } from "@/components/ui/button";
import { useChatNav } from "@/features/chat";
import type { AppRouteId } from "@/core/navigation";
import { toast } from "sonner";
import { ScheduleDialog } from "@/components/schedule-dialog";
import { useAgentsPage } from "../hooks/useAgentsPage";
import { AgentsListCard } from "../components/AgentsListCard";
import { CreateAgentModal } from "../components/CreateAgentModal";
import { EditAgentModal } from "../components/EditAgentModal";

/** Fallback when avatars.json is missing or avatar is unset. */
const DEFAULT_AVATAR = "agent1.jpg";

function avatarUrl(filename: string | null | undefined): string {
  if (!filename) return `/media/${DEFAULT_AVATAR}`;
  return `/media/${filename}`;
}

export function AgentsPage({ onNavigate }: { onNavigate?: (p: AppRouteId) => void } = {}) {
  const { openChatWithAgent } = useChatNav();
  const {
    agents,
    loading,
    error,
    editingScheduleId,
    setEditingScheduleId,
    editingAvatarId,
    avatarSaving,
    deletingId,
    runJobId,
    installingSystem,
    showCreate,
    createStep,
    setCreateStep,
    skillsList,
    createForm,
    setCreateForm,
    createProvider,
    setCreateProvider,
    createSaving,
    createError,
    describePrompt,
    setDescribePrompt,
    suggestLoading,
    setSuggestLoading,
    suggestError,
    setSuggestError,
    editingAgentId,
    editProvider,
    setEditProvider,
    editForm,
    setEditForm,
    editSaving,
    editError,
    availableAvatars,
    promptTab,
    setPromptTab,
    promptContent,
    setPromptContent,
    promptLoading,
    promptSaving,
    promptError,
    installFromSystem,
    toggleAgentSchedule,
    runAgentNow,
    deleteAgentById,
    updateAgentAvatar,
    saveAgentSchedule,
    savePromptFile,
    createAgentFromForm,
    saveEditedAgent,
    openCreateModal,
    closeCreateModal,
    startEditAgent,
    closeEditModal,
    toggleAvatarPicker,
    closeAvatarPicker,
    promptFilenames,
  } = useAgentsPage();

  /** Memory is always included for all agents; hide from picker so it is not optional. */
  const selectableSkills = skillsList.filter((s) => s.id !== "memory");

  if (loading) return <div className="p-4 text-muted-foreground">Loading agents…</div>;
  if (error) return <div className="p-4 text-destructive">Failed to load agents: {error}</div>;

  return (
    <div className="space-y-8 p-6 max-w-4xl mx-auto">
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Agents</h1>
          <p className="text-muted-foreground text-sm">Create and manage agents. Use Chat to run an agent with a task.</p>
        </div>
        <Button
          className="shrink-0 mt-2 sm:mt-0"
          onClick={openCreateModal}
        >
          Add agent
        </Button>
      </div>

      <AgentsListCard
        agents={agents}
        installingSystem={installingSystem}
        editingAvatarId={editingAvatarId}
        avatarSaving={avatarSaving}
        deletingId={deletingId}
        runJobId={runJobId}
        availableAvatars={availableAvatars}
        avatarUrl={avatarUrl}
        onInstallSystem={async () => {
          try {
            const { installed } = await installFromSystem();
            toast.success(installed > 0 ? `Installed ${installed} agent${installed === 1 ? "" : "s"} from system.` : "No new agents to install (already present).");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to install from system");
          }
        }}
        onOpenCreate={openCreateModal}
        onOpenChat={openChatWithAgent}
        onManageMemory={onNavigate ? (agentId) => {
          try {
            sessionStorage.setItem("memoryFilterAgentId", agentId);
          } catch {
            /* ignore */
          }
          onNavigate("memory");
        } : undefined}
        onStartEdit={startEditAgent}
        onEditSchedule={setEditingScheduleId}
        onToggleSchedule={async (a) => {
          try {
            await toggleAgentSchedule(a.id, a.schedule_enabled === false);
            toast.success(a.schedule_enabled === false ? "Schedule resumed" : "Schedule paused");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to update");
          }
        }}
        onRunNow={async (a) => {
          try {
            await runAgentNow(a.id, a.schedule_input ?? "");
            toast.success("Job queued");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to run job");
          }
        }}
        onDelete={async (a) => {
          if (!confirm(`Delete agent "${a.name}"? This cannot be undone.`)) return;
          try {
            await deleteAgentById(a.id);
            toast.success("Agent deleted");
          } catch (e) {
            toast.error(e instanceof Error ? e.message : "Failed to delete agent");
          }
        }}
        onToggleAvatarPicker={toggleAvatarPicker}
        onSelectAvatar={async (agentId, filename) => {
          try {
            await updateAgentAvatar(agentId, filename);
          } catch {}
        }}
        onCancelAvatar={closeAvatarPicker}
      />

      {editingScheduleId && (() => {
        const agent = agents.find((x) => x.id === editingScheduleId);
        return agent ? (
          <ScheduleDialog
            open={true}
            onOpenChange={(open) => !open && setEditingScheduleId(null)}
            schedule={agent.schedule}
            scheduleInput={agent.schedule_input}
            scheduleReportTargets={agent.schedule_report_targets ?? undefined}
            title="Edit schedule"
            onSave={async (payload) => {
              await saveAgentSchedule(editingScheduleId, payload);
            }}
          />
        ) : null;
      })()}

      <CreateAgentModal
        open={showCreate}
        onClose={closeCreateModal}
        createStep={createStep}
        setCreateStep={setCreateStep}
        describePrompt={describePrompt}
        setDescribePrompt={setDescribePrompt}
        suggestLoading={suggestLoading}
        setSuggestLoading={setSuggestLoading}
        suggestError={suggestError}
        setSuggestError={setSuggestError}
        createForm={createForm}
        setCreateForm={setCreateForm}
        createProvider={createProvider}
        setCreateProvider={setCreateProvider}
        createSaving={createSaving}
        createError={createError}
        selectableSkills={selectableSkills}
        availableAvatars={availableAvatars}
        onCreate={async () => {
          try {
            await createAgentFromForm();
          } catch {}
        }}
      />

      <EditAgentModal
        open={Boolean(editingAgentId)}
        editingAgentId={editingAgentId}
        onClose={closeEditModal}
        editProvider={editProvider}
        setEditProvider={setEditProvider}
        editForm={editForm}
        setEditForm={setEditForm}
        selectableSkills={selectableSkills}
        availableAvatars={availableAvatars}
        promptTab={promptTab}
        setPromptTab={setPromptTab}
        promptLoading={promptLoading}
        promptContent={promptContent}
        setPromptContent={setPromptContent}
        promptError={promptError}
        promptSaving={promptSaving}
        promptFilenames={promptFilenames}
        savePromptFile={savePromptFile}
        onPromptSaved={(filename) => toast.success(`Saved ${filename}`)}
        editError={editError}
        editSaving={editSaving}
        saveEditedAgent={saveEditedAgent}
        onAgentSaved={() => toast.success("Agent updated")}
      />
    </div>
  );
}
