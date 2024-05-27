import base64
import folder_paths
import os
import time
import torch
import torchvision.transforms as transforms
from aiohttp import web
from io import BytesIO
from PIL import Image
from server import PromptServer

subfolder = "p5js";
full_output_folder = os.path.join(folder_paths.get_input_directory(), os.path.normpath(subfolder))

# save sketch to js file
@PromptServer.instance.routes.post("/HYPE/save_p5js_sketch")
async def saveSketch(request):

    json_data = await request.json()
    filename = json_data.get("file", "sketch") + ".js"
    code = json_data.get("code", "")

    try:
        if not os.path.exists(full_output_folder):
            os.makedirs(full_output_folder)

        save_sketch_file = os.path.abspath(os.path.join(full_output_folder, filename))

        f = open(save_sketch_file, "w")
        f.write(code)
        f.close()

        return web.json_response({"message": "Sketch saved", "file": filename}, status=200)

    except Exception as e:
        print("Error saving js file: ", e)

# handle proxy response
@PromptServer.instance.routes.post('/HYPE/proxy_reply')
async def proxyHandle(request):
    post = await request.json()
    MessageHolder.addMessage(post["node_id"], post["outputs"])
    return web.json_response({"status": "ok"})

def base64_to_tensor(base64_string):
    # Decode the base64 string to bytes
    image_data = base64.b64decode(base64_string)
    # Create a BytesIO object from the byte data
    image_bytes = BytesIO(image_data)
    # Open the image with PIL
    image = Image.open(image_bytes)
    # Define a transformation to convert the PIL image to a tensor
    transform = transforms.ToTensor()
    # Apply the transformation to the image
    tensor_image = transform(image)
    # If needed, add a batch dimension (optional)
    tensor_image = tensor_image.unsqueeze(0)
    return tensor_image

class HYPE_P5JSImage:
    def __init__(self):
        pass
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {},
            "optional": {
                "script": ("STRING", {"default": "function setup() {\n  createCanvas(512, 512);\n}\n\nfunction draw() {\n  background(220);\n}", "multiline": True}),
            },
            "hidden": {
                "prompt": "PROMPT",
                "id": "UNIQUE_ID",
            }
        }

    def IS_CHANGED(id):
        return True

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)

    FUNCTION = "run"

    #OUTPUT_NODE = False

    CATEGORY = "p5js"

    def run(self, script, prompt, id):
        PromptServer.instance.send_sync("proxy", {
            "id": id,
        })
        outputs = MessageHolder.waitForMessage(id)
        tensor_image = base64_to_tensor(outputs['output'])
        tensor_image = tensor_image.permute(0, 2, 3, 1)
        return (tensor_image,)

# Message Handling
class MessageHolder:
    messages = {}

    @classmethod
    def addMessage(self, id, message):
        self.messages[str(id)] = message

    @classmethod
    def waitForMessage(self, id, period = 0.1):
        sid = str(id)
        while not (sid in self.messages):
            time.sleep(period)
        message = self.messages.pop(str(id),None)
        return message
