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

it("manages colours and protects an unapplied draft", async () => {
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
  const button = (text: string) => {
    const found = [...host.querySelectorAll("button")].find((item) => item.textContent === text || item.getAttribute("aria-label") === text);
    if (!found) throw new Error(`Missing button: ${text}`);
    return found;
  };
  const click = async (text: string) => { await act(() => button(text).click()); };
  const fill = async (index: number, value: string) => {
    const input = host.querySelectorAll("input")[index];
    await act(() => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
  };
  await click("Add colour");
  await fill(0, "blue");
  await fill(2, "0000FF");
  await click("Close colours");
  expect(confirm).toHaveBeenCalledOnce();
  expect(host.querySelector("dialog")).not.toBeNull();
  await click("Save colour");
  expect(plan.toJson().colours).toEqual([{ id: "white", value: "FFFFFF" }, { id: "blue", value: "0000FF" }]);
  const blueEdit = host.querySelector<HTMLButtonElement>('[aria-label="Edit blue"]')!;
  await act(() => blueEdit.click());
  await fill(1, "Exterior");
  await click("Save colour");
  expect(plan.colours[1].description).toBe("Exterior");
  confirm.mockReturnValue(true);
  const remove = host.querySelector<HTMLButtonElement>('[aria-label="Remove blue"]')!;
  await act(() => remove.click());
  expect(plan.colours).toEqual([{ id: "white", value: "FFFFFF" }]);
  await click("Close colours");
  expect(host.querySelector("dialog")).toBeNull();
  await act(() => root.unmount());
});
