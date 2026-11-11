import { useState } from "react";
import type { GeometryController } from "../geometry/GeometryController";
import { canEditExpression } from "../geometry/ExpressionInput";
export function EquationInput({
  controller,
  disabled,
  onSubmitted,
}: {
  controller?: GeometryController;
  disabled: boolean;
  onSubmitted: () => void;
}) {
  const [value, setValue] = useState(""),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const selected = controller?.selection,
    editable =
      !!controller &&
      !!selected &&
      canEditExpression(controller.adapter.api, selected);
  return (
    <form
      className="equation-input"
      onSubmit={(event) => {
        event.preventDefault();
        if (!controller || disabled) return;
        try {
          const names = controller.enterExpression(value);
          onSubmitted();
          setError("");
          setNotice(`Đã cập nhật ${names.join(", ")}.`);
          setValue("");
        } catch (e) {
          setNotice("");
          setError(
            e instanceof Error ? e.message : "Không thể vẽ công thức này.",
          );
        }
      }}
    >
      <span className="equation-symbol" aria-hidden="true">
        ƒ
      </span>
      <input
        aria-label="Nhập phương trình"
        aria-describedby="equation-feedback"
        placeholder="y = x^2 · x^2 + y^2 = 9 · A = (1, 2)"
        value={value}
        maxLength={512}
        disabled={disabled || !controller}
        onChange={(event) => {
          setValue(event.target.value);
          setError("");
          setNotice("");
        }}
      />
      <button
        type="button"
        disabled={disabled || !editable}
        onClick={() => {
          if (controller && selected) {
            setValue(controller.adapter.api.getValueString(selected, false));
            setNotice("");
            setError("");
          }
        }}
      >
        Sửa công thức
      </button>
      <button
        type="submit"
        className="primary"
        disabled={disabled || !controller || !value.trim()}
      >
        Vẽ
      </button>
      <div
        id="equation-feedback"
        className={error ? "equation-feedback error" : "equation-feedback"}
        role={error ? "alert" : "status"}
      >
        {error || notice}
      </div>
    </form>
  );
}
