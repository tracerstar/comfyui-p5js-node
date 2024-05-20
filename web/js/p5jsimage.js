import { app } from "/scripts/app.js";
import { api } from "/scripts/api.js";
import { $el } from "/scripts/ui.js";

async function saveSketch(srcCode) {
  try {
    const response = await fetch("/HYPE/save_p5js_sketch", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: srcCode,
    });
    if (response.status !== 200)
      throw new Error(`Error saving sketch file: ${response.statusText}`);
  } catch (e) {
    console.log(`Error sending sketch file for saving: ${e}`);
  }
}

app.registerExtension({
  name: "Comfy.p5jsimage",
  
  async beforeRegisterNodeDef(nodeType, nodeData, app) {

    if (nodeData.name !== "HYPE_P5JSImage") {
        return
    }

    const onNodeCreated = nodeType.prototype.onNodeCreated;
    nodeType.prototype.onNodeCreated = async function () {

      const me = onNodeCreated ? onNodeCreated.apply(this, arguments) : undefined;

      /*
        Set up the widget
      */
      const widget = {
          type: "p5js_widget",
          name: "p5jsComfyNode",
          size: [512,512],
          
          draw(ctx, node, widget_width, y, widget_height) {
            const margin = 10,
                  left_offset = 0,
                  top_offset = 0,
                  visible = app.canvas.ds.scale > 0.6 && this.type === "p5js_widget",
                  w = widget_width - margin * 2,
                  clientRectBound = ctx.canvas.getBoundingClientRect(),
                  transform = new DOMMatrix().scaleSelf(
                    clientRectBound.width / ctx.canvas.width,
                    clientRectBound.height / ctx.canvas.height
                    )
                    .multiplySelf(ctx.getTransform())
                    .translateSelf(margin, margin + y),
                  scale = new DOMMatrix().scaleSelf(transform.a, transform.d);

            Object.assign(this.inputEl.style, {
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

      /*
        Add an iframe to the node to preview the sketch
      */
      let previewSrc = new URL(`../preview/index.html`, import.meta.url);
      widget.inputEl = $el("iframe", { width:400,height:400, src: previewSrc });
      document.body.appendChild(widget.inputEl);

      /*
        Add a button to run the save sketch method
      */
      this.addWidget("button", "Run Sketch", "run_p5js_sketch", () => {
        saveSketch(this.widgets[0].value);
        widget.inputEl.contentWindow.location.reload();
      });

      /*
        Add a listener to send the canvas over when the prompt is queued
      */
      api.addEventListener('proxy', function proxyHandler (event) {
        const data = event.detail;

        //get the canvas from iframe
        var iframe = widget.inputEl;
        var iframe_doc = iframe.contentDocument || iframe.contentWindow.document;
        var canvas = iframe_doc.getElementById("defaultCanvas0");//TODO: maybe change this to pull all canvas elements and return the first one created

        const reply = {
          node_id: data.id,
          outputs: {
            output: canvas.toDataURL('image/png').split(',')[1]
          }
        };

        api.fetchApi("/HYPE/proxy_reply", {
          method: "POST",
          headers: {"Content-Type": "application/json",},
          body: JSON.stringify(reply),
        });
      });

      /*
        Finally add the widget, clean up code, and we do not want to be serialized!
      */
      this.addCustomWidget(widget);
      this.onRemoved = function () { widget.inputEl.remove(); };
      this.serialize_widgets = false;

      return me;
    };
  }
});
