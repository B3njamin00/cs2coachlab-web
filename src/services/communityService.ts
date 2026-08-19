import {
  collection,
  deleteDoc,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  type Timestamp,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";
import type { PreferredRole } from "./settingsService";

export const PRO_CONFIG_ADMIN_EMAIL = "u9470487773@gmail.com";

export type CommunityConfig = {
  id: string;
  ownerUid: string;
  ownerName: string;
  role: PreferredRole;
  skillElo: number;
  dpi: number;
  sensitivity: number;
  edpi: number;
  zoomSensitivity: number | null;
  crosshairShareCode: string;
  fileName: string;
  content: string;
  updatedAt?: Timestamp | null;
};

export type ProConfig = {
  id: string;
  playerName: string;
  team: string;
  role: PreferredRole;
  sourceLabel: string;
  sourceUrl: string;
  dpi: number;
  sensitivity: number;
  edpi: number;
  zoomSensitivity: number | null;
  crosshairShareCode: string;
  fileName: string;
  content: string;
  createdByUid: string;
  createdByEmail: string;
  updatedAt?: Timestamp | null;
};

export type ProConfigInput = Omit<ProConfig, "id" | "updatedAt">;

export function subscribeToCommunityConfigs(
  onData: (configs: CommunityConfig[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "communityConfigs"), orderBy("updatedAt", "desc")),
    (snapshot) => {
      onData(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as CommunityConfig
        )
      );
    },
    (error) => onError?.(error)
  );
}

export function subscribeToProConfigs(
  onData: (configs: ProConfig[]) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    query(collection(db, "proConfigs"), orderBy("updatedAt", "desc")),
    (snapshot) => {
      onData(
        snapshot.docs.map(
          (item) => ({ id: item.id, ...item.data() }) as ProConfig
        )
      );
    },
    (error) => onError?.(error)
  );
}

export async function publishCommunityConfig(
  config: Omit<CommunityConfig, "id" | "updatedAt">
) {
  await setDoc(
    doc(db, "communityConfigs", config.ownerUid),
    { ...config, updatedAt: serverTimestamp() },
    { merge: true }
  );
}

export async function removeCommunityConfig(uid: string) {
  await deleteDoc(doc(db, "communityConfigs", uid));
}

export async function saveProConfig(configId: string | null, config: ProConfigInput) {
  const reference = configId
    ? doc(db, "proConfigs", configId)
    : doc(collection(db, "proConfigs"));

  await setDoc(
    reference,
    { ...config, updatedAt: serverTimestamp() },
    { merge: true }
  );

  return reference.id;
}

export async function deleteProConfig(configId: string) {
  await deleteDoc(doc(db, "proConfigs", configId));
}

export function downloadCfg(fileName: string, content: string) {
  const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName || "autoexec.cfg";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}
