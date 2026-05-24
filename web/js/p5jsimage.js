import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { $el } from "/scripts/ui.js";

const p5jsPreviewSrc = new URL(`../preview/index.html`, import.meta.url);

async function saveSketch(filename, srcCode) {
  try {
    const blob = new Blob([srcCode], { type: "text/plain" });
    const file = new File([blob], filename + ".js");
    const body = new FormData();
    body.append("image", file);
    body.append("subfolder", "p5js");
    body.append("type", "temp");
    body.append("overwrite", "true"); //can also be set to 1
    const resp = await api.fetchApi("/upload/image", {
      method: "POST",
      body,
    });
    if (resp.status !== 200) {
      const err = `Error uploading sketch: ${resp.status} - ${resp.statusText}`;
      alert(err);
      throw new Error(err);
    }

    return resp;
  } catch (e) {
    console.log(`Error sending sketch file for saving: ${e}`);
  }
} //end saveSketch

// Poll the iframe document until p5.js has created its canvas, or time out.
async function waitForCanvas(iframe, timeoutMs = 15000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const doc = iframe.contentDocument || iframe.contentWindow?.document;
    const canvas = doc && doc.getElementById("defaultCanvas0");
    if (canvas && canvas.width > 0 && canvas.height > 0) {
      // Give draw() a moment to render its first frame before we read pixels.
      await new Promise((r) => setTimeout(r, 200));
      return canvas;
    }
    await new Promise((r) => setTimeout(r, 50));
  }
  return null;
}

// Save the current script and (re)load it into the iframe so p5.js runs it.
// Resolves with the rendered canvas once it exists.
async function runSketch(iframe, sketchfile, srcCode) {
  await saveSketch(sketchfile, srcCode);
  iframe.src = p5jsPreviewSrc + "?sketch=" + sketchfile + ".js";
  return waitForCanvas(iframe);
}

// Lazy-load CodeMirror 6 (only once, shared across all nodes).
let codeMirrorPromise = null;
function loadCodeMirror() {
  if (!codeMirrorPromise) {
    codeMirrorPromise = Promise.all([
      import("https://esm.sh/codemirror@6.0.1"),
      import("https://esm.sh/@codemirror/lang-javascript@6.2.2"),
      import("https://esm.sh/@codemirror/theme-one-dark@6.1.2"),
      import("https://esm.sh/@codemirror/view@6.26.3"),
      import("https://esm.sh/@codemirror/commands@6.5.0"),
    ]).then(([cm, langJs, theme, view, commands]) => ({
      EditorView: cm.EditorView,
      basicSetup: cm.basicSetup,
      javascript: langJs.javascript,
      oneDark: theme.oneDark,
      keymap: view.keymap,
      indentWithTab: commands.indentWithTab,
      indentMore: commands.indentMore,
      indentLess: commands.indentLess,
    }));
  }
  return codeMirrorPromise;
}

async function attachCodeMirror(widget) {
  console.log("[p5js] script widget:", widget);
  console.log("[p5js] widget keys:", Object.keys(widget));
  console.log(
    "[p5js] element:",
    widget.element,
    "inputEl:",
    widget.inputEl,
    "options:",
    widget.options,
  );

  // The widget's element gets mounted into ComfyUI's DOM container a few frames
  // after the widget is created. Wait until it actually has a parent, AND also
  // fall back to a DOM query for the textarea that ComfyUI eventually attaches.
  let target = null;
  for (let i = 0; i < 240; i++) {
    target =
      (widget.element && widget.element.parentNode && widget.element) ||
      (widget.inputEl && widget.inputEl.parentNode && widget.inputEl) ||
      (widget.element instanceof HTMLElement ? widget.element : null) ||
      null;
    if (target && target.parentNode) break;

    // Last-resort: scan the DOM for the textarea ComfyUI creates for the
    // multiline string widget on this node.
    const allTextareas = document.querySelectorAll(
      "textarea.comfy-multiline-input, textarea",
    );
    for (const ta of allTextareas) {
      if (
        ta.value === widget.value ||
        ta.placeholder === widget.name ||
        ta.dataset?.widgetName === widget.name
      ) {
        target = ta;
        break;
      }
    }
    if (target && target.parentNode) break;
    target = null;

    await new Promise((r) => requestAnimationFrame(r));
  }
  if (!target || !target.parentNode) {
    console.warn(
      "[p5js] script widget element never mounted; skipping CodeMirror",
      widget,
    );
    return;
  }
  console.log("[p5js] mounting CodeMirror onto", target.tagName, target);

  const {
    EditorView,
    basicSetup,
    javascript,
    oneDark,
    keymap,
    indentWithTab,
    indentMore,
    indentLess,
  } = await loadCodeMirror();
  console.log("[p5js] CodeMirror loaded");

  const initialValue = widget.value ?? target.value ?? "";

  const container = document.createElement("div");
  container.style.cssText =
    "width: 100%; height: 100%; min-height: 200px; overflow: hidden;" +
    "box-sizing: border-box; border-radius: 4px; cursor: text;";

  target.parentNode.replaceChild(container, target);

  const editor = new EditorView({
    doc: initialValue,
    extensions: [
      basicSetup,
      keymap.of([indentWithTab]),
      javascript(),
      oneDark,
      EditorView.theme({
        "&": { height: "100%", fontSize: "12px" },
        ".cm-scroller": {
          overflow: "auto",
          fontFamily:
            "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
        },
      }),
      EditorView.updateListener.of((update) => {
        if (update.docChanged) {
          // Push the new text back into the widget via its existing setter,
          // which keeps ComfyUI's prompt serialization in sync.
          widget.value = editor.state.doc.toString();
        }
      }),
    ],
    parent: container,
  });

  // Capture-phase handler — runs before any ComfyUI listener can move focus
  // off the editor. Manually invoke indentMore / indentLess instead of relying
  // on CodeMirror's keymap, which can lose the race against outer listeners.
  container.addEventListener(
    "keydown",
    (e) => {
      if (e.key !== "Tab") return;
      e.preventDefault();
      e.stopPropagation();
      (e.shiftKey ? indentLess : indentMore)(editor);
    },
    true,
  );

  // Clicks inside the editor should place the text caret — not start a node
  // drag. Let CodeMirror handle the event, then stop it bubbling out to
  // ComfyUI's canvas.
  for (const evt of ["pointerdown", "mousedown", "dblclick"]) {
    container.addEventListener(evt, (e) => e.stopPropagation());
  }

  widget._cmEditor = editor;
}

// Kick off the CDN fetch early so the editor is ready by the time a node is created.
loadCodeMirror();

app.registerExtension({
  name: "HYPE_P5JSImage",

  getCustomWidgets(app) {
    return {
      P5JS(node, inputName) {
        const d = new Date();
        const base_filename =
          d.getUTCFullYear() +
          "_" +
          (d.getUTCMonth() + 1) +
          "_" +
          d.getUTCDate() +
          "_";

        const sketchfile =
          base_filename + Math.floor(Math.random() * 10000);

        const iframe = $el("iframe", {
          src: p5jsPreviewSrc,
          style: {
            border: "1px solid #000",
            width: "100%",
            height: "100%",
            padding: 0,
            margin: 0,
            display: "block",
            background: "#222",
          },
        });

        node.serialize_widgets = false;

        //add run sketch button first so it sits above the iframe
        const btn = node.addWidget(
          "button",
          "Run Sketch",
          "run_p5js_sketch",
          () => {
            runSketch(iframe, sketchfile, node.widgets[0].value);
          }
        );
        btn.serializeValue = () => undefined;

        // addDOMWidget mounts the iframe inside ComfyUI's DOM-widget container,
        // which is automatically positioned/scaled by ComfyUI as the canvas pans and zooms.
        const widget = node.addDOMWidget("image", "P5JS", iframe, {
          hideOnZoom: false,
          getMinHeight: () => 400,
        });
        widget.sketchfile = sketchfile;

        return widget;
      },
    };
  },

  nodeCreated(node) {
    if (node.constructor.comfyClass !== "HYPE_P5JSImage") return;

    //upgrade the script textarea to a CodeMirror editor
    const scriptWidget = node.widgets.find((w) => w.name === "script");
    if (scriptWidget) {
      attachCodeMirror(scriptWidget).catch((e) => {
        console.error("Failed to mount CodeMirror editor:", e);
      });
    }

    //get the p5js widget
    const p5jsWidget = node.widgets.find((w) => w.name === "image");

    //add serialize method here....
    p5jsWidget.serializeValue = async () => {
      //get the canvas from iframe
      const theFrame = p5jsWidget.element;
      const iframe_doc =
        theFrame.contentDocument || theFrame.contentWindow.document;
      let canvas = iframe_doc.getElementById("defaultCanvas0"); //TODO: maybe change this to pull all canvas elements and return the first one created

      // If the sketch has never been run (no canvas yet), run it now so the
      // workflow still works without the user clicking "Run Sketch" first.
      if (!canvas) {
        const scriptWidget = node.widgets.find((w) => w.name === "script");
        canvas = await runSketch(
          theFrame,
          p5jsWidget.sketchfile,
          scriptWidget ? scriptWidget.value : node.widgets[0].value,
        );
        if (!canvas) {
          const err = "p5.js sketch did not produce a canvas";
          alert(err);
          throw new Error(err);
        }
      }

      const blob = await new Promise((r) => canvas.toBlob(r));
      const name = `${+new Date()}.png`;
      const file = new File([blob], name);
      const body = new FormData();
      body.append("image", file);
      body.append("subfolder", "p5js");
      body.append("type", "temp");
      const resp = await api.fetchApi("/upload/image", {
        method: "POST",
        body,
      });
      if (resp.status !== 200) {
        const err = `Error uploading image: ${resp.status} - ${resp.statusText}`;
        alert(err);
        throw new Error(err);
      }
      return `p5js/${name} [temp]`;
    };
  },
});
