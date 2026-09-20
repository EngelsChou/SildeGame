import { isProfile, newProfile } from "../domain/profile.ts";
import type { Profile } from "../domain/profile.ts";
/** Development-only adapter. Never upload this client-authored state to production. */
export interface ProfileRepository {
  load(): Profile;
  save(profile: Profile): void;
}
export class LocalPreviewRepository implements ProfileRepository {
  static readonly key = "gogo-rpg.development.profile.v1";
  private readonly storage: Pick<Storage, "getItem" | "setItem">;
  constructor(storage: Pick<Storage, "getItem" | "setItem"> = localStorage) {
    this.storage = storage;
  }
  load(): Profile {
    const raw = this.storage.getItem(LocalPreviewRepository.key);
    if (!raw) return newProfile();
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      throw new Error("本機存檔無法讀取，已保留原始資料，未自動覆蓋。");
    }
    if (!isProfile(parsed))
      throw new Error("本機存檔格式不相容，已保留原始資料，未自動覆蓋。");
    return parsed;
  }
  save(profile: Profile) {
    this.storage.setItem(LocalPreviewRepository.key, JSON.stringify(profile));
  }
}
