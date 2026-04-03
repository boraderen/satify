(function () {
  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  function clampInteger(value, minimum, maximum, fallback) {
    const nextValue = Math.trunc(Number(value));

    if (Number.isNaN(nextValue)) {
      return fallback === undefined ? minimum : fallback;
    }

    return clamp(nextValue, minimum, maximum);
  }

  function copyMatrix(matrix) {
    return matrix.map((row) => row.slice());
  }

  function unique(values) {
    return Array.from(new Set(values));
  }

  function range(count) {
    return Array.from({ length: count }, function (_, index) {
      return index;
    });
  }

  function shuffle(values) {
    const copy = values.slice();

    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(Math.random() * (index + 1));
      const current = copy[index];
      copy[index] = copy[swapIndex];
      copy[swapIndex] = current;
    }

    return copy;
  }

  function createId(prefix) {
    return `${prefix || "id"}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function now() {
    return globalThis.performance?.now() ?? Date.now();
  }

  function nextFrame() {
    return new Promise(function (resolve) {
      requestAnimationFrame(function () {
        resolve();
      });
    });
  }

  function measureOperation(task) {
    const firstStart = now();
    let result = task();
    const firstElapsed = now() - firstStart;

    if (firstElapsed >= 1) {
      return {
        result,
        runtimeMs: firstElapsed,
      };
    }

    let iterations = 1;
    let totalElapsed = firstElapsed;

    while (totalElapsed < 12 && iterations < 256) {
      const nextIterations = Math.min(iterations * 2, 256);
      const start = now();

      for (let index = 0; index < nextIterations; index += 1) {
        result = task();
      }

      totalElapsed = now() - start;
      iterations = nextIterations;
    }

    return {
      result,
      runtimeMs: totalElapsed / iterations,
    };
  }

  function formatMs(value) {
    if (value === null || value === undefined) {
      return "-";
    }

    if (value < 1) {
      return `${value.toFixed(3)} ms`;
    }

    if (value < 100) {
      return `${value.toFixed(2)} ms`;
    }

    return `${value.toFixed(1)} ms`;
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  window.SATifyCommon = {
    clamp,
    clampInteger,
    copyMatrix,
    unique,
    range,
    shuffle,
    createId,
    now,
    nextFrame,
    measureOperation,
    formatMs,
    escapeHtml,
  };
})();
