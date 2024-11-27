import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { $el } from "/scripts/ui.js";

const p5jsPreviewSrc = new URL(`../preview/index.html`, import.meta.url);

async function saveSketch(filename, srcCode) {
  try {
    const blob = new Blob([srcCode], { type: 'text/plain' });
    const file = new File([blob], filename + '.js');
    const body = new FormData();
    body.append("image", file);
    body.append("subfolder", "p5js");
    body.append("type", "temp");
    body.append("overwrite", "true");//can also be set to 1
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
}//end saveSketch


app.registerExtension({

  name: "HYPE_P5JSImage",

  getCustomWidgets(app) {
    return {
      P5JS(node, inputName) {
        const d = new Date();
        const base_filename = d.getUTCFullYear() + "_" + (d.getUTCMonth() + 1) + "_" + d.getUTCDate() + '_';

        const widget = {
          type: "P5JS",
          name: "image",
          size: [512, 120],
          sketchfile: base_filename + Math.floor(Math.random() * 10000), //unique filename for each widget, don't love this... maybe make it a millis based time stamp?
          iframe: $el("iframe", { width: 400, height: 400, src: p5jsPreviewSrc }),

          draw(ctx, node, widget_width, y, widget_height) {
            const [px, py] = node.pos; // node offest
            const margin = 10;
            const [cx, cy] = app.canvas.ds.offset; // node offest
            const [ix, iy] = [
              ((cx + px + margin) * app.canvas.ds.scale) + app.bodyLeft.offsetWidth,
              ((cy + py + margin + 305) * app.canvas.ds.scale) + app.bodyLeft.offsetWidth,
            ];

            const 
              w = widget_width - margin * 2,
              clientRectBound = ctx.canvas.getBoundingClientRect(),
              scaleFactorX = clientRectBound.width / ctx.canvas.width,
              scaleFactorY = clientRectBound.height / ctx.canvas.height,
              transform = new DOMMatrix().scaleSelf(scaleFactorX, scaleFactorY).multiplySelf(ctx.getTransform()).translateSelf(px, py);

            Object.assign(this.iframe.style, {
              left: `${ix}px`,
              top: `${iy}px`,
              width: `${w * transform.a}px`,
              height: `${w * transform.d}px`,
              position: "absolute",
              border: '1px solid #000',
              padding: 0,
              margin: 0,
              zIndex: app.graph._nodes.indexOf(node),
              display: app.canvas.ds.scale > 0.1 ? 'block' : 'none'
            });
          },

          computeSize(width) {
            return [512, 512];
          },
        };

        node.onRemoved = function () {
          node.widgets[0].inputEl.remove();
          widget.iframe.remove();
        };

        node.serialize_widgets = false;

        //add run sketch
        const btn = node.addWidget("button", "Run Sketch", "run_p5js_sketch", () => {
          saveSketch(widget.sketchfile, node.widgets[0].value).then((response) => {
            widget.iframe.src = p5jsPreviewSrc + "?sketch=" + widget.sketchfile + '.js';
          });
        });
        btn.serializeValue = () => undefined;

        return node.addCustomWidget(widget);
      },
    };
  },

  nodeCreated(node) {
    if ((node.type, node.constructor.comfyClass !== "HYPE_P5JSImage")) return;

    //get the p5js widget
    const p5jsWidget = node.widgets.find((w) => w.name === "image");

    //add serialize method here....
    p5jsWidget.serializeValue = async () => {
      //get the canvas from iframe
      var theFrame = p5jsWidget.iframe;
      var iframe_doc = theFrame.contentDocument || theFrame.contentWindow.document;
      var canvas = iframe_doc.getElementById("defaultCanvas0");//TODO: maybe change this to pull all canvas elements and return the first one created

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
    }

    //add the iframe to the bottom of the node
    document.body.appendChild(p5jsWidget.iframe);

  },
});
