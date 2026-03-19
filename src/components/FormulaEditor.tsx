"use client";

import { useEffect, useState } from "react";
import type { FormulaMode, Literal } from "@/lib/sat";

export type FormulaDraftClause = {
  id: string;
  literals: Literal[];
};

type FormulaEditorProps = {
  mode: FormulaMode;
  clauses: FormulaDraftClause[];
  variableCount: number;
  variableNames: string[];
  maxVariables: number;
  maxClauses: number;
  maxClauseLength: number;
  randomVariableCount: number;
  randomClauseCount: number;
  randomMaxClauseLength: number;
  onVariableCountChange: (value: number) => void;
  onRandomVariableCountChange: (value: number) => void;
  onRandomClauseCountChange: (value: number) => void;
  onRandomMaxClauseLengthChange: (value: number) => void;
  onGenerateRandom: () => void;
  onAddClause: () => void;
  onRemoveClause: (clauseId: string) => void;
  onUpdateLiteral: (
    clauseId: string,
    literalIndex: number,
    nextLiteral: Literal,
  ) => void;
  onAddLiteral: (clauseId: string) => void;
  onRemoveLiteral: (clauseId: string, literalIndex: number) => void;
};

function sanitizeIntegerInput(value: string) {
  return value.replace(/\D+/g, "");
}

export function FormulaEditor({
  mode,
  clauses,
  variableCount,
  variableNames,
  maxVariables,
  maxClauses,
  maxClauseLength,
  randomVariableCount,
  randomClauseCount,
  randomMaxClauseLength,
  onVariableCountChange,
  onRandomVariableCountChange,
  onRandomClauseCountChange,
  onRandomMaxClauseLengthChange,
  onGenerateRandom,
  onAddClause,
  onRemoveClause,
  onUpdateLiteral,
  onAddLiteral,
  onRemoveLiteral,
}: FormulaEditorProps) {
  const [variableCountInput, setVariableCountInput] = useState(String(variableCount));
  const [randomVariableInput, setRandomVariableInput] = useState(
    String(randomVariableCount),
  );
  const [randomClauseInput, setRandomClauseInput] = useState(
    String(randomClauseCount),
  );
  const [randomMaxLengthInput, setRandomMaxLengthInput] = useState(
    String(randomMaxClauseLength),
  );

  useEffect(() => {
    setVariableCountInput(String(variableCount));
  }, [variableCount]);

  useEffect(() => {
    setRandomVariableInput(String(randomVariableCount));
  }, [randomVariableCount]);

  useEffect(() => {
    setRandomClauseInput(String(randomClauseCount));
  }, [randomClauseCount]);

  useEffect(() => {
    setRandomMaxLengthInput(String(randomMaxClauseLength));
  }, [randomMaxClauseLength]);

  function commitVariableCount(value: string) {
    if (value === "") {
      setVariableCountInput(String(variableCount));
      return;
    }

    const nextValue = Math.min(maxVariables, Math.max(1, Number(value)));
    onVariableCountChange(nextValue);
    setVariableCountInput(String(nextValue));
  }

  function commitRandomVariables(value: string) {
    if (value === "") {
      setRandomVariableInput(String(randomVariableCount));
      return;
    }

    const nextValue = Math.min(maxVariables, Math.max(1, Number(value)));
    onRandomVariableCountChange(nextValue);
    setRandomVariableInput(String(nextValue));
  }

  function commitRandomClauses(value: string) {
    if (value === "") {
      setRandomClauseInput(String(randomClauseCount));
      return;
    }

    const nextValue = Math.min(maxClauses, Math.max(1, Number(value)));
    onRandomClauseCountChange(nextValue);
    setRandomClauseInput(String(nextValue));
  }

  function commitRandomMaxLength(value: string) {
    if (value === "") {
      setRandomMaxLengthInput(String(randomMaxClauseLength));
      return;
    }

    const nextValue = Math.min(maxClauseLength, Math.max(1, Number(value)));
    onRandomMaxClauseLengthChange(nextValue);
    setRandomMaxLengthInput(String(nextValue));
  }

  return (
    <section className="panel formula-editor-panel">
      <div className="editor-toolbar">
        <div>
          <h3>{mode === "sat" ? "CNF formula" : "3-CNF formula"}</h3>
          <p>
            {mode === "sat"
              ? "Edit clauses directly, then reduce the formula to 3-SAT."
              : "Each clause contains exactly three literals."}
          </p>
        </div>
        <div className="toolbar-actions">
          <button
            className="accent-button"
            type="button"
            onClick={onAddClause}
            disabled={clauses.length >= maxClauses}
          >
            Add clause
          </button>
        </div>
      </div>

      <div className="formula-editor-strip">
        <label className="editor-mini-field">
          <span>Variables</span>
          <input
            type="text"
            inputMode="numeric"
            value={variableCountInput}
            onChange={(event) =>
              setVariableCountInput(sanitizeIntegerInput(event.target.value))
            }
            onBlur={() => commitVariableCount(variableCountInput)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitVariableCount(variableCountInput);
              }
            }}
          />
        </label>
        <label className="editor-mini-field">
          <span>Random vars</span>
          <input
            type="text"
            inputMode="numeric"
            value={randomVariableInput}
            onChange={(event) =>
              setRandomVariableInput(sanitizeIntegerInput(event.target.value))
            }
            onBlur={() => commitRandomVariables(randomVariableInput)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitRandomVariables(randomVariableInput);
              }
            }}
          />
        </label>
        <label className="editor-mini-field">
          <span>Random clauses</span>
          <input
            type="text"
            inputMode="numeric"
            value={randomClauseInput}
            onChange={(event) =>
              setRandomClauseInput(sanitizeIntegerInput(event.target.value))
            }
            onBlur={() => commitRandomClauses(randomClauseInput)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                commitRandomClauses(randomClauseInput);
              }
            }}
          />
        </label>
        {mode === "sat" ? (
          <label className="editor-mini-field">
            <span>Max clause size</span>
            <input
              type="text"
              inputMode="numeric"
              value={randomMaxLengthInput}
              onChange={(event) =>
                setRandomMaxLengthInput(sanitizeIntegerInput(event.target.value))
              }
              onBlur={() => commitRandomMaxLength(randomMaxLengthInput)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  commitRandomMaxLength(randomMaxLengthInput);
                }
              }}
            />
          </label>
        ) : (
          <div className="formula-editor-note">Random clauses keep exactly 3 literals.</div>
        )}
        <button
          className="ghost-button"
          type="button"
          onClick={onGenerateRandom}
        >
          Random instance
        </button>
      </div>

      <div className="formula-clause-list">
        {clauses.map((clause, clauseIndex) => (
          <article className="formula-editor-clause" key={clause.id}>
            <div className="formula-editor-clause-head">
              <strong>{`C${clauseIndex + 1}`}</strong>
              <button
                className="ghost-button formula-inline-button"
                type="button"
                onClick={() => onRemoveClause(clause.id)}
                disabled={clauses.length <= 1}
              >
                Remove
              </button>
            </div>

            <div className="formula-editor-literals">
              <span className="formula-editor-paren">(</span>
              {clause.literals.map((literal, literalIndex) => (
                <div className="formula-editor-literal-wrap" key={`${clause.id}-${literalIndex}`}>
                  <div className="formula-editor-literal">
                    <button
                      className={`literal-negation-toggle${
                        literal.negated ? " literal-negation-toggle-active" : ""
                      }`}
                      type="button"
                      onClick={() =>
                        onUpdateLiteral(clause.id, literalIndex, {
                          ...literal,
                          negated: !literal.negated,
                        })
                      }
                    >
                      ¬
                    </button>
                    <select
                      value={literal.variable}
                      onChange={(event) =>
                        onUpdateLiteral(clause.id, literalIndex, {
                          ...literal,
                          variable: event.target.value,
                        })
                      }
                    >
                      {variableNames.map((variable) => (
                        <option key={variable} value={variable}>
                          {variable.replace("_", "")}
                        </option>
                      ))}
                    </select>
                    {mode === "sat" && clause.literals.length > 1 ? (
                      <button
                        className="ghost-button formula-inline-button"
                        type="button"
                        onClick={() => onRemoveLiteral(clause.id, literalIndex)}
                      >
                        −
                      </button>
                    ) : null}
                  </div>
                  {literalIndex < clause.literals.length - 1 ? (
                    <span className="formula-editor-join">∨</span>
                  ) : null}
                </div>
              ))}
              <span className="formula-editor-paren">)</span>
            </div>

            {mode === "sat" ? (
              <div className="formula-editor-actions">
                <button
                  className="ghost-button formula-inline-button"
                  type="button"
                  onClick={() => onAddLiteral(clause.id)}
                  disabled={clause.literals.length >= maxClauseLength}
                >
                  Add literal
                </button>
              </div>
            ) : null}
          </article>
        ))}
      </div>
    </section>
  );
}
