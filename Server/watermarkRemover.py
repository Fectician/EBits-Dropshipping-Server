import numpy as np
import cv2
import onnxruntime as rt
from PIL import Image
import os

# Define the path to your ONNX model file
onnx_model_path = "generator_model.onnx"

# Load the ONNX model
session = rt.InferenceSession(onnx_model_path)

path_to_images_folder = "." + os.sep + os.sep + "imgWithWatermarks"
path_to_saving_images_folder = "." + os.sep + os.sep + "public" + os.sep + os.sep + "img"
# image_extension = ".jpg" #or other extensions

all_image_files = os.listdir(path_to_images_folder)
all_broken = []
maybe_broken = []
def func(image):
    outputs = session.run(None, {"input": image})
    out = np.squeeze(outputs[0])
    out = out.transpose((1, 2, 0))
    if not grey:
        out = (out * 255).astype(np.uint8)
    else:
        out = out.astype(np.uint8)
    out = Image.fromarray(out)
    out = out.convert('RGB')
    out = out.resize((800, 800))
    out.save(path_to_saving_images_folder + os.sep + os.sep + os.path.splitext(image_file)[0] + ".jpg")

for image_file in all_image_files:
    print(image_file)
    image_path = os.path.join(path_to_images_folder,image_file)
    image = Image.open(image_path)
    grey = False
    image = image.resize((512, 512))
    image = np.array(image).astype(np.float32)
    try:
        image = np.transpose(image / 255.0, [2, 0, 1])
    except:
        grey = True
    image = np.expand_dims(image, axis=0)
    try:
        func(image)
    except:
        try:
            out = np.squeeze(image)
            if not grey:
                out = (out * 255).astype(np.uint8)
            else:
                out = out.astype(np.uint8)
            out = Image.fromarray(out)
            out = out.resize((800, 800))
            out = out.convert('RGB')
            #I = np.asarray(out)
            #I = I.astype(np.float32)
            #I = np.transpose(I, [2, 0, 1])
            #I = np.expand_dims(I, axis=0)
            #func(I)
            
            out.save(path_to_saving_images_folder + os.sep + os.sep + os.path.splitext(image_file)[0] + ".jpg")
            print(image_file + " failed, Likely error: Image might be greyscale. Saving as " + os.path.splitext(image_file)[0] + ".jpg")
            all_broken.append(image_file)
        except:
            out = np.squeeze(image)
            out = out.transpose((1, 2, 0))
            if not grey:
                out = (out * 255).astype(np.uint8)
            else:
                out = out.astype(np.uint8)
            out = Image.fromarray(out)
            out = out.convert('RGB')
            I = np.asarray(out)
            I = I.astype(np.float32)
            try:
                I = np.transpose(I / 255.0, [2, 0, 1])
            except:
                pass
            I = np.expand_dims(I, axis=0)
            print("Image: ", image_file, " might have been the wrong size, trying to automatically scale...")
            try:
                func(I)
                maybe_broken.append(image_file)
            except:
                print("Something went wrong, adding image to list of broken images...")
                all_broken.append(image_file)
                
            #out.save(path_to_saving_images_folder + os.sep + os.sep + os.path.splitext(image_file)[0] + ".jpg")
            

            
            #print(grey)
            #image = image.resize((800, 800))
            #image = image.convert('RGB')
            #print("Oh no man")
            #image.save(path_to_saving_images_folder + os.sep + os.sep + os.path.splitext(image_file)[0] + ".jpg")
            #time.sleep(10)
            #image = Image.open(path_to_saving_images_folder + os.sep + os.sep + os.path.splitext(image_file)[0] + ".jpg")
            #print("I awake once more")
            #function1(image)
print("Printing every file that went wrong: (They will be saved with the others, but will still contain watermarks. It's likely these images are greyscale.")
print(all_broken + "\n")
print("Printing every file that triggered the automatic resizer (These images should be correct, but could not be): ")
print(maybe_broken)
# # Preprocess the input image
# image = Image.open("LG001-1.jpg")
# image = image.resize((512, 512))
# image = np.array(image).astype(np.float32)
# image = np.transpose(image / 255.0, (2, 0, 1))
# image = np.expand_dims(image, axis=0)
# outputs = session.run(None, {"input": image})
# out = np.squeeze(outputs[0])
# out = out.transpose((1, 2, 0))
# out = (out * 255).astype(np.uint8)
# out = Image.fromarray(out)
# out = out.convert('RGB')
# out = out.resize((800, 800))
# out.save("output_image1.jpg")
