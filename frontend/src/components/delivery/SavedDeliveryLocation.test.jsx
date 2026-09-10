import React, { useState } from "react";
import { act } from "react-dom/test-utils";
import { createRoot } from "react-dom/client";
import SavedDeliveryLocation, { deliveryLocationDraft } from "./SavedDeliveryLocation";

let root, container, getPosition;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  getPosition = jest.fn();
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition: getPosition } });
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });
function Form({ initial }) {
  const [value, setValue] = useState(deliveryLocationDraft(initial));
  return <><SavedDeliveryLocation value={value} onChange={setValue} /><output>{JSON.stringify(value)}</output></>;
}
const click = text => act(() => [...container.querySelectorAll("button")].find(b => b.textContent.includes(text)).click());

test("empty form requests GPS only on explicit detection and preserves address", () => {
  act(() => root.render(<Form initial={{ delivery_address: "PG Room 204" }} />));
  expect(getPosition).not.toHaveBeenCalled();
  click("Detect my location");
  expect(getPosition).toHaveBeenCalledTimes(1);
  act(() => getPosition.mock.calls[0][0]({ coords: { latitude: 28.6, longitude: 77.2, accuracy: 10 } }));
  expect(container.querySelector("input").value).toBe("PG Room 204");
  expect(container.querySelector("output").textContent).toContain('"latitude":28.6');
  expect(container.textContent).toContain("save to confirm");
});

test("saved room remains fixed until removal and explicit redetection", () => {
  act(() => root.render(<Form initial={{ delivery_address: "Home PG", delivery_lat: 28.6, delivery_lng: 77.2 }} />));
  expect(getPosition).not.toHaveBeenCalled();
  expect(container.querySelector("input").readOnly).toBe(true);
  expect(container.textContent).toContain("Saved delivery location");
  click("Remove / change location");
  expect(getPosition).not.toHaveBeenCalled();
  expect(container.querySelector("input").value).toBe("");
  expect(container.querySelector("input").readOnly).toBe(false);
  click("Detect my location");
  act(() => getPosition.mock.calls[0][0]({ coords: { latitude: 29, longitude: 78 } }));
  expect(container.querySelector("output").textContent).toContain('"replace_saved_location":true');
});

test("late GPS callback after closing cannot update a saved draft", () => {
  const onChange = jest.fn();
  act(() => root.render(<SavedDeliveryLocation value={deliveryLocationDraft()} onChange={onChange} />));
  click("Detect my location");
  act(() => root.render(null));
  act(() => getPosition.mock.calls[0][0]({ coords: { latitude: 29, longitude: 78 } }));
  expect(onChange).not.toHaveBeenCalled();
});
