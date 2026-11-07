// Rust 명령 호출 래퍼. 개인정보 값은 이 경로로만 오가며 외부로 나가지 않습니다.
import { invoke } from "@tauri-apps/api/core";

export type ProfileSummary = {
  id: string;
  name: string;
  recoveryEnabled: boolean;
};

export type Settings = {
  weeklyReport: boolean;
  autoLockMinutes: number;
};

export type CreateResult = {
  profile: ProfileSummary;
  recoveryWarning: string | null;
};

export const api = {
  listProfiles: () => invoke<ProfileSummary[]>("list_profiles"),
  currentProfile: () => invoke<ProfileSummary | null>("current_profile"),
  createProfile: (name: string, password: string, noticeAcknowledged: boolean) =>
    invoke<CreateResult>("create_profile", { name, password, noticeAcknowledged }),
  unlock: (profileId: string, password: string) =>
    invoke<ProfileSummary>("unlock", { profileId, password }),
  lock: () => invoke<void>("lock"),
  changePassword: (oldPassword: string, newPassword: string) =>
    invoke<void>("change_password", { oldPassword, newPassword }),
  recoveryRequest: (profileId: string) => invoke<string>("recovery_request", { profileId }),
  recoveryApply: (profileId: string, code: string, newPassword: string) =>
    invoke<ProfileSummary>("recovery_apply", { profileId, code, newPassword }),
  loadPersonalData: () => invoke<Record<string, unknown>>("load_personal_data"),
  savePersonalData: (data: Record<string, unknown>) => invoke<void>("save_personal_data", { data }),
  getSettings: () => invoke<Settings>("get_settings"),
  setSettings: (settings: Settings) => invoke<void>("set_settings", { settings }),
  prepareUpdate: () => invoke<void>("prepare_update"),
  exportBackup: (backupPassword: string) => invoke<string>("export_backup", { backupPassword }),
  importBackup: (text: string, backupPassword: string) =>
    invoke<Record<string, unknown>>("import_backup", { text, backupPassword }),
};

export function errorMessage(e: unknown): string {
  if (typeof e === "string") return e;
  if (e instanceof Error) return e.message;
  return String(e);
}
