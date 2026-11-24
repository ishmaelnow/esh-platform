"use client";
export function TextField({
  label,
  name,
  value = "",
  type = "text",
  maxLength = 200,
  required = true,
  disabled = false,
}: {
  label: string;
  name: string;
  value?: string;
  type?: string;
  maxLength?: number;
  required?: boolean;
  disabled?: boolean;
}) {
  return (
    <label>
      {label}
      <input
        name={name}
        type={type}
        defaultValue={value}
        maxLength={maxLength}
        required={required}
        disabled={disabled}
      />
    </label>
  );
}
