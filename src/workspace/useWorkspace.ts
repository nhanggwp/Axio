import { useCallback, useEffect, useRef, useState } from "react";
import type { GeometryController } from "../geometry/GeometryController";
import { constructionKey } from "../geometry/GeometryState";
import { documentRequest, type CloudDocument } from "./client";
export function useWorkspace(
  controller: GeometryController | undefined,
  title: string,
  setTitle: (title: string) => void,
  userId: string | undefined,
) {
  const [active, setActive] = useState<CloudDocument | null>(null),
    [status, setStatus] = useState("Chưa lưu"),
    [error, setError] = useState("");
  const activeRef = useRef<CloudDocument | null>(null),
    ownerRef = useRef(userId),
    busyRef = useRef(false),
    epoch = useRef(0),
    titleRef = useRef(title);
  const paused = useRef(false), idle = useRef(new Set<() => void>());
  titleRef.current = title;
  const setDocument = useCallback((doc: CloudDocument | null) => {
    activeRef.current = doc;
    setActive(doc);
  }, []);
  useEffect(() => {
    if (ownerRef.current !== userId) {
      ownerRef.current = userId;
      epoch.current++;
      setDocument(null);
      setStatus("Chưa lưu vào tài khoản");
      setError("");
    }
  }, [userId, setDocument]);
  const save = useCallback(
    async (asNew = false) => {
      if (!controller || !userId)
        throw new Error("Đăng nhập để lưu vào tài khoản.");
      if (busyRef.current) return;
      busyRef.current = true;
      setStatus("Đang lưu…");
      setError("");
      const generation = epoch.current;
      const current = asNew ? null : activeRef.current;
      const key = constructionKey(controller.adapter.snapshot()),
        documentTitle = titleRef.current;
      try {
        const data = await controller.adapter.base64();
        if (generation !== epoch.current) return;
        const doc = await documentRequest<CloudDocument>(
          current ? "/" + current.id : "",
          {
            method: current ? "PATCH" : "POST",
            body: JSON.stringify({
              title: documentTitle,
              data,
              ...(current ? { version: current.version } : {}),
            }),
          },
        );
        if (generation !== epoch.current) return;
        setDocument(doc);
        controller.markSaved(key);
        setStatus("Đã lưu vào tài khoản");
        return doc;
      } catch (e) {
        const message =
          e instanceof Error ? e.message : "Không thể lưu tài liệu.";
        if (generation === epoch.current) {
          setError(message);
          setStatus("Lưu không thành công");
        }
        throw e;
      } finally {
        busyRef.current = false;
        idle.current.forEach((resolve) => resolve());
        idle.current.clear();
      }
    },
    [controller, userId, setDocument],
  );
  useEffect(() => {
    if (!controller) return;
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      clearTimeout(timer);
      if (
        !userId ||
        paused.current ||
        !activeRef.current ||
        controller.loading ||
        (!controller.dirty && titleRef.current === activeRef.current.title)
      )
        return;
      setStatus("Có thay đổi chưa lưu");
      timer = setTimeout(() => { if (!paused.current && activeRef.current) void save().catch(() => {}); }, 1500);
    };
    const unsubscribe = controller.subscribe(schedule);
    schedule();
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [controller, userId, save, title]);
  const open = async (id: string) => {
    if (!controller) return;
    epoch.current++;
    const doc = await documentRequest<CloudDocument>("/" + id);
    if (!doc.data) throw new Error("Tài liệu không có dữ liệu hình học.");
    await controller.openDocument(doc.data);
    epoch.current++;
    setDocument(doc);
    setTitle(doc.title);
    setStatus("Đã mở tài liệu tài khoản");
    setError("");
  };
  const detach = () => {
    epoch.current++;
    setDocument(null);
    setStatus("Chưa lưu");
    setError("");
  };
  const renamed = (doc: CloudDocument) => {
    if (activeRef.current?.id === doc.id) {
      setDocument({ ...activeRef.current, ...doc });
      setTitle(doc.title);
    }
  };
  const deleted = (id: string) => {
    if (activeRef.current?.id === id) detach();
  };
  const restore = (doc: CloudDocument | null) => {
    epoch.current++;
    setDocument(doc);
    setStatus(doc ? "Đã mở tài liệu tài khoản" : "Chưa lưu vào tài khoản");
    setError("");
  };
  return { active, status, error, save, open, detach, renamed, deleted, restore,
    current: () => activeRef.current,
    waitForIdle: () => busyRef.current ? new Promise<void>((resolve) => idle.current.add(resolve)) : Promise.resolve(),
    pauseAutosave: () => { paused.current = true; },
    resumeAutosave: () => { paused.current = false; controller?.sync(); },
  };
}
