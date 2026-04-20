import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Audio,
  staticFile,
} from "remotion";
import { transform } from "sucrase";
import type { ScenePlan } from "@video-ai/shared";

export interface EvaluationResult {
  component: React.ComponentType<{ scenePlan: ScenePlan }> | null;
  error: string | null;
}

const ALLOWED_GLOBALS: Record<string, unknown> = {
  React,
  useState,
  useEffect,
  useMemo,
  useCallback,
  AbsoluteFill,
  Sequence,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
  spring,
  Easing,
  Audio,
  staticFile,
};

const PARAM_NAMES = Object.keys(ALLOWED_GLOBALS);
const PARAM_VALUES = Object.values(ALLOWED_GLOBALS);

/**
 * Transpile JSX/TSX code to plain JavaScript using sucrase.
 * Returns the transpiled code or throws on syntax errors.
 */
function transpileJSX(code: string): string {
  const result = transform(code, {
    transforms: ["jsx", "typescript"],
    jsxRuntime: "classic",
    production: true,
  });
  return result.code;
}

/**
 * Strip import/export statements from AI-generated code.
 * new Function() doesn't support ES module syntax.
 */
function stripModuleStatements(code: string): string {
  return code
    // Remove import statements (handles multiple on same line and multiline)
    .replace(/import\s+(?:\{[^}]*\}|\*\s+as\s+\w+|\w+)(?:\s*,\s*(?:\{[^}]*\}|\*\s+as\s+\w+|\w+))*\s+from\s+["'][^"']+["'];?/g, "")
    // Remove simple import side-effect statements like: import "module";
    .replace(/import\s+["'][^"']+["'];?/g, "")
    // Remove export default
    .replace(/export\s+default\s+/g, "")
    // Remove named exports
    .replace(/export\s+(?=(?:const|let|var|function|class|async)\s)/g, "")
    // Remove destructuring from React that tries to get Remotion globals
    .replace(/const\s+\{[^}]*\}\s*=\s*React\s*;?/g, "")
    .trim();
}

export function evaluateComponentCode(code: string): EvaluationResult {
  try {
    // Strip any import/export statements the AI may have included
    const cleanedCode = stripModuleStatements(code);

    // Transpile JSX to React.createElement calls so new Function() can parse it
    const transpiledCode = transpileJSX(cleanedCode);

    const wrappedBody = `${transpiledCode}\nreturn typeof Main === 'function' ? Main : undefined;`;

    // eslint-disable-next-line @typescript-eslint/no-implied-eval
    const factory = new Function(...PARAM_NAMES, wrappedBody);
    const Main = factory(...PARAM_VALUES);

    if (typeof Main !== "function") {
      return {
        component: null,
        error: "Generated code does not define a Main component function.",
      };
    }

    return {
      component: Main as React.ComponentType<{ scenePlan: ScenePlan }>,
      error: null,
    };
  } catch (err: unknown) {
    if (err instanceof SyntaxError) {
      const message = err.message;
      return { component: null, error: `SyntaxError: ${message}` };
    }

    return {
      component: null,
      error: err instanceof Error ? err.message : String(err),
    };
  }
}
