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

it("manages colours, shows field errors, protects drafts and moves with the title bar", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value: () => {} });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value: () => {} });
  const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
  const plan = Plan.fromJson({ colours: [{ id: "white", value: "FFFFFF" }] });
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  const editor = new PlanEditor(plan, () => {});
  const Harness = () => {
    const [open, setOpen] = useState(true);
    return open ? <ColoursDialog plan={plan} editor={editor} onClose={() => setOpen(false)} /> : null;
  };
  await act(() => root.render(createElement(Harness)));
  const button = (name: string) => {
    const found = [...host.querySelectorAll("button")].find((item) =>
      item.textContent === name || item.getAttribute("aria-label") === name);
    if (!found) throw new Error(`Missing button: ${name}`);
    return found;
  };
  const click = async (name: string) => { await act(() => button(name).click()); };
  const fill = async (label: string, value: string) => {
    const input = host.querySelector<HTMLInputElement | HTMLTextAreaElement>(`[aria-label="${label}"]`)!;
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    await act(() => {
      Object.getOwnPropertyDescriptor(prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };

  expect(host.querySelector<HTMLInputElement>('[aria-label="ID"]')!.value).toBe("white");
  await click("+ Add colour");
  await fill("ID", "white");
  await fill("Hex value", "#0000FF");
  await click("Apply");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("A colour with this ID already exists.");
  await fill("ID", "blue");
  await click("Close colours");
  expect(confirm).toHaveBeenCalledOnce();
  expect(host.querySelector("dialog")).not.toBeNull();
  await click("Apply");
  expect(plan.toJson().colours).toEqual([{ id: "white", value: "FFFFFF" }, { id: "blue", value: "0000FF" }]);
  expect(host.querySelector<HTMLInputElement>('[aria-label="ID"]')!.value).toBe("blue");

  await fill("Description", "Exterior");
  await click("Apply");
  expect(plan.colours[1].description).toBe("Exterior");
  await fill("Hex value", "12345");
  await click("Apply");
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("Enter 6 hex digits (e.g. 2E5E4E).");
  await click("Revert");
  expect(host.querySelector<HTMLInputElement>('[aria-label="Hex value"]')!.value).toBe("0000FF");

  const header = host.querySelector("header")!;
  await act(() => header.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0, clientX: 10, clientY: 10 })));
  await act(() => window.dispatchEvent(new MouseEvent("mousemove", { clientX: 40, clientY: 25 })));
  await act(() => window.dispatchEvent(new MouseEvent("mouseup")));
  expect(host.querySelector("dialog")!.style.transform).toBe("translate(30px, 15px)");

  confirm.mockReturnValue(true);
  await click("Remove…");
  expect(plan.colours).toEqual([{ id: "white", value: "FFFFFF" }]);
  expect(host.querySelector<HTMLInputElement>('[aria-label="ID"]')!.value).toBe("white");
  await click("Close");
  expect(host.querySelector("dialog")).toBeNull();
  await act(() => root.unmount());
});
