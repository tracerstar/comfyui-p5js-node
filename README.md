# comfyui-p5js-node
Custom node for ComfyUI to run p5js

## What this is

A simple proof of concept node to pass a p5js canvas through ComfyUI for img2img generation use.

## What this isn't

A full blown p5js editor. That already exists. There's no debugging or error checking here. This node expects a working sketch to be pasted in the input to render to a canvas.

## How it works

* Paste your sketch in the text box and press the "*Run Sketch*" button.
* The sketch is saved to the temp folder in a subdirectory, named `p5js/sketch.js`
* The iframe gets refreshed with this sketch.
* Pressing "*Queue Prompt*" will trigger the node to pass control to the JS to query for the canvas obect in the iframe and then return it back for * processing to an image. The image then gets passed along the pipeline.

## Installation and tips

Clone the repository into your ComfyUI custom_nodes directory. You can clone the repository with the command:

```
git clone https://github.com/tracerstar/comfyui-p5js-node.git
```

When writing your p5js sketch, make sure you use the basic method of creating a canvas in your setup method. Right now the JS will only grab the canvas object by the default ID p5js adds (`defaultCanvas0`). This can be improved later on.

```
function setup() {
    createCanvas(512,512);
}
```

## What's next

* Some UI improvements (maybe allowing sketches to save and later be picked from a dropdown like the loadImage node)
* Looking into the feasibility of animation / batch iamges
