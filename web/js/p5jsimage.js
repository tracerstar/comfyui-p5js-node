import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { $el } from "/scripts/ui.js";

const p5jsPreviewSrc = new URL(`../preview/index.html`, import.meta.url);

async function saveSketch(filename, srcCode) {
  try {
    const response = await fetch("/HYPE/save_p5js_sketch", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({file: filename, code: srcCode}),
    });

    if (response.status !== 200) {
      throw new Error(`Error saving sketch file: ${response.statusText}`);
    }

    return response;
  } catch (e) {
    console.log(`Error sending sketch file for saving: ${e}`);
  }
}//end saveSketch


app.registerExtension({
  
  name: "HYPE_P5JSImage",
  
  getCustomWidgets(app) {
    return {
      P5JS(node, inputName) {

        //add sketch text area

        const d = new Date();
        const base_filename = d.getUTCFullYear() + "_" + (d.getUTCMonth()+1) + "_" + d.getUTCDate() + '_';

        const widget = {
          type: "P5JS",
          name: "image",
          size: [512,120],
          sketchfile: base_filename + Math.floor(Math.random() * 10000), //unique filename for each widget
          iframe: $el("iframe", { width:400, height:400, src:p5jsPreviewSrc }),

          draw(ctx, node, widget_width, y, widget_height) {
            const margin          = 10,
                  left_offset     = 0,
                  top_offset      = 0,
                  visible         = app.canvas.ds.scale > 0.6 && this.type === "p5js_widget",
                  w               = widget_width - margin * 2,
                  clientRectBound = ctx.canvas.getBoundingClientRect(),
                  transform       = new DOMMatrix().scaleSelf(clientRectBound.width / ctx.canvas.width, clientRectBound.height / ctx.canvas.height).multiplySelf(ctx.getTransform()).translateSelf(margin, margin + y),
                  scale           = new DOMMatrix().scaleSelf(transform.a, transform.d);

            Object.assign(this.iframe.style, {
              left: `${transform.a * margin * left_offset + transform.e}px`,
              top: `${transform.d + transform.f + top_offset}px`,
              width: `${w * transform.a}px`,
              height: `${w * transform.d}px`,
              position: "absolute",
              border: '1px solid #000',
              padding: 0,
              margin: 0,
              zIndex: app.graph._nodes.indexOf(node),
            });
          },
          
          computeSize(width) {    
            return [512,512];
          },
        };

        node.onRemoved = function () { widget.iframe.remove(); };
        node.serialize_widgets = false;

        //add run sketch
        const btn = node.addWidget("button", "Run Sketch", "run_p5js_sketch", () => {
          saveSketch(widget.sketchfile, node.widgets[0].value).then((response) => {
            const jsonPromise = response.json();
            jsonPromise.then((data) => {
              let loadFile = data.file;
              widget.iframe.src = p5jsPreviewSrc + "?sketch=" + loadFile;
            });
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
        const err = `Error uploading camera image: ${resp.status} - ${resp.statusText}`;
        alert(err);
        throw new Error(err);
      }
      return `p5js/${name} [temp]`;
    }

    //add the iframe to the bottom of the node
    document.body.appendChild(p5jsWidget.iframe);
    
  },
});