import {
  doc,
  onSnapshot,
  serverTimestamp,
  setDoc,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "../firebase";

export type PreferredRole =
  | "Entry"
  | "AWPer"
  | "Support"
  | "Lurker"
  | "IGL"
  | "Flex";

export type UserSettings = {
  preferredRole: PreferredRole;
  trainingMinutes: 15 | 30 | 60 | 90;
  dpi: number;
  sensitivity: number;
  crosshairShareCode: string;
  configFileName: string;
  configContent: string;
  autoexecFileName: string;
  autoexecContent: string;
};

export const defaultUserSettings: UserSettings = {
  preferredRole: "Flex",
  trainingMinutes: 30,
  dpi: 800,
  sensitivity: 1.4,
  crosshairShareCode: "",
  configFileName: "",
  configContent: "",
  autoexecFileName: "",
  autoexecContent: "",
};

function settingsReference(uid: string) {
  return doc(db, "users", uid, "profile", "settings");
}

export function subscribeToUserSettings(
  uid: string,
  onSettings: (settings: UserSettings) => void,
  onError?: (error: Error) => void
): Unsubscribe {
  return onSnapshot(
    settingsReference(uid),
    (snapshot) => {
      if (!snapshot.exists()) {
        onSettings(defaultUserSettings);
        return;
      }

      const data = snapshot.data();
      onSettings({
        preferredRole: (data.preferredRole || defaultUserSettings.preferredRole) as PreferredRole,
        trainingMinutes: Number(data.trainingMinutes || defaultUserSettings.trainingMinutes) as 15 | 30 | 60 | 90,
        dpi: Number(data.dpi || defaultUserSettings.dpi),
        sensitivity: Number(data.sensitivity || defaultUserSettings.sensitivity),
        crosshairShareCode: String(data.crosshairShareCode || ""),
        configFileName: String(data.configFileName || ""),
        configContent: String(data.configContent || ""),
        autoexecFileName: String(data.autoexecFileName || ""),
        autoexecContent: String(data.autoexecContent || ""),
      });
    },
    (error) => onError?.(error)
  );
}

export async function saveUserSettings(uid: string, settings: UserSettings) {
  await setDoc(
    settingsReference(uid),
    {
      ...settings,
      dpi: Math.max(1, Math.round(settings.dpi)),
      sensitivity: Math.max(0.01, Number(settings.sensitivity)),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );
}
