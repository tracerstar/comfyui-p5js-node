import base64
import nodes
import folder_paths
import os
import time
import torch
import torchvision.transforms as transforms
from aiohttp import web
from io import BytesIO
from PIL import Image
from server import PromptServer

# handle proxy response
@PromptServer.instance.routes.post('/HYPE/proxy_reply')
async def proxyHandle(request):
    post = await request.json()
    MessageHolder.addMessage(post["node_id"], post["outputs"])
    return web.json_response({"status": "ok"})

class HYPE_P5JSImage(nodes.LoadImage):
    
    @classmethod
    def INPUT_TYPES(s):
        return {
            "required": {
                "script": ("STRING", 
                           {
                               "default": "function setup() {\n  createCanvas(512, 512);\n}\n\nfunction draw() {\n  background(220);\n}", 
                               "multiline": True, 
                               "dynamicPrompts": False,
                            }),
                "image": ("P5JS", {
                    
                }),
            },
        }

    def IS_CHANGED(id):
        return True

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image",)

    FUNCTION = "run"

    #OUTPUT_NODE = False

    CATEGORY = "p5js"

    def run(s, script, image, **kwargs):
        return super().load_image(folder_paths.get_annotated_filepath(image))

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
