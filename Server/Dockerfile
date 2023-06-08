# syntax=docker/dockerfile:1

FROM nikolaik/python-nodejs:python3.10-nodejs18-bullseye

ENV NODE_ENV=production



WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]
RUN npm install --production


#RUN update-alternatives --install /usr/bin/python python3 /usr/local/bin/python3.10.10
RUN pip install requests_cache
#RUN pip install numpy
#RUN pip install pillow
#RUN pip install onnxruntime
#RUN pip install opencv-python
#RUN apt-get update && apt-get install ffmpeg libsm6 libxext6  -y
COPY . .

EXPOSE 5000

CMD [ "node", "server.js" ]
