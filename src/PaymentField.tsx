import { useState } from "react";
import { normalizeName, type PaymentMethod } from "./model";
/** Financial rows retain recorded text; this registry only supplies entry choices. */
export function paymentOptions(
  methods: PaymentMethod[],
  values: string[] = [],
  includeArchived = false,
) {
  const options = new Map<string, string>();
  for (const m of methods)
    if (
      !m.archived ||
      (includeArchived &&
        values.some((v) => normalizeName(v) === m.normalizedName))
    )
      options.set(m.normalizedName, m.name);
  for (const value of values) {
    const key = normalizeName(value);
    if (key && !options.has(key))
      options.set(key, value.trim().replace(/\s+/g, " "));
  }
  return [...options].sort(([a], [b]) => a.localeCompare(b));
}
export function PaymentField({
  methods,
  value,
  onChange,
  label = "Payment method",
}: {
  methods: PaymentMethod[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const [custom, setCustom] = useState(false);
  const [customText, setCustomText] = useState("");
  const options = paymentOptions(methods);
  // Preserve an edited legacy/archived value byte-for-byte unless the user changes it.
  if (value && !options.some(([, name]) => name === value) && !custom)
    options.push([`legacy:${normalizeName(value)}`, value]);
  return (
    <>
      <label>
        {label}
        <select
          aria-required="true"
          value={custom ? "custom" : value ? `value:${value}` : ""}
          onChange={(e) => {
            const other = e.target.value === "custom";
            setCustom(other);
            if (other) setCustomText("");
            onChange(other ? "Other" : e.target.value.slice(6));
          }}
        >
          <option value="" disabled hidden>
            Select payment method
          </option>
          {options
            .filter(([, name]) => normalizeName(name) !== "other")
            .map(([key, name]) => (
              <option
                key={key}
                value={`value:${name}`}
                hidden={
                  key.startsWith("legacy:") &&
                  options.some(([otherKey]) => otherKey === normalizeName(name))
                }
              >
                {name}
              </option>
            ))}
          <option value="custom">Other</option>
          {!custom && normalizeName(value) === "other" && (
            <option value={`value:${value}`} hidden>
              {value}
            </option>
          )}
        </select>
      </label>
      {custom && (
        <label>
          Custom payment method (optional)
          <input
            maxLength={80}
            value={customText}
            placeholder="Other"
            onChange={(e) => {
              setCustomText(e.target.value);
              onChange(e.target.value.trim() ? e.target.value : "Other");
            }}
          />
        </label>
      )}
    </>
  );
}
