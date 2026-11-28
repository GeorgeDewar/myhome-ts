// @vitest-environment jsdom
import { act, createElement, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { Plan } from "../model/Plan";
import { PlanEditor } from "../model/PlanEditor";
import { ColoursDialog } from "./ColoursDialog";

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
  document.body.replaceChildren();
});

it("manages named colours with generated IDs, field errors, draft protection and dragging", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: () => {} });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: () => {} });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const plan = Plan.fromJson({ colours: [{ id: "white", name: "White", value: "FFFFFF" }] });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const editor = new PlanEditor(plan, () => {});
  const Harness = () => {
    const [open, setOpen] = useState(true);
    return open ? <ColoursDialog plan={plan} editor={editor} onClose={() => setOpen(false)} /> : null;
  };
  await act(() => root.render(createElement(Harness)));
  const input = (label: string) => host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
  const button = (name: string) => {
    const found = [...host.querySelectorAll("button")].find((item) =>
      item.textContent === name || item.getAttribute("aria-label") === name);
    if (!found) throw new Error(`Missing button: ${name}`);
    return found;
  };
  const click = async (name: string) => { await act(() => button(name).click()); };
  const fill = async (label: string, value: string) => {
    const field = input(label);
    const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(() => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(field, value);
      field.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  expect(input("Name").value).toBe("White");
  await click("+ Add colour");
  await fill("Name", "White");
  expect(input("ID").value).toBe("white-2");
  expect(input("ID").readOnly).toBe(true);
  expect(host.textContent).toContain("Another colour is already called “White”");
  await fill("Name", "Fence Brown");
  expect(input("ID").value).toBe("fence-brown");
  await fill("Hex value", "#8B5A2B");
  await click("Auto · Edit");
  await fill("ID", "brown");
  await fill("Name", "Cedar Brown");
  expect(input("ID").value).toBe("brown");
  await click("Custom · Reset to auto");
  expect(input("ID").value).toBe("cedar-brown");
  await click("Close colours");
  expect(confirm).toHaveBeenCalledOnce();
  expect(host.querySelector("dialog")).not.toBeNull();
  await click("Apply");
  expect(plan.toJson().colours).toEqual([
    { id: "white", name: "White", value: "FFFFFF" },
    { id: "cedar-brown", name: "Cedar Brown", value: "8B5A2B" },
  ]);

  await fill("Name", "Fence Brown");
  expect(input("ID").value).toBe("cedar-brown");
  expect(host.textContent).toContain("Renaming doesn’t change the ID.");
  await click("Generate from name");
  expect(input("ID").value).toBe("fence-brown");
  await fill("Description", "Exterior");
  await click("Apply");
  expect(plan.colours[1]).toEqual({ id: "fence-brown", name: "Fence Brown", description: "Exterior", value: "8B5A2B" });
  await fill("Name", " ");
  await click("Apply");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("Enter a colour name.");
  await fill("Name", "Fence Brown");
  await fill("Hex value", "12345");
  await click("Apply");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("Enter 6 hex digits (e.g. 2E5E4E).");
  await click("Revert");
  expect(input("Hex value").value).toBe("8B5A2B");

  const header = host.querySelector("header")!;
  await act(() => header.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 10, clientY: 10 })));
  await act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 40, clientY: 25 })));
  await act(() => window.dispatchEvent(new MouseEvent("mouseup")));
  expect(host.querySelector("dialog")!.style.transform).toBe("translate(30px, 15px)");

  confirm.mockReturnValue(true);
  await click("Remove…");
  expect(plan.colours).toEqual([{ id: "white", name: "White", value: "FFFFFF" }]);
  expect(input("Name").value).toBe("White");
  await click("Close");
  expect(host.querySelector("dialog")).toBeNull();
  await act(() => root.unmount());
});
