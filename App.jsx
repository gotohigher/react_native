/**
 * Sample React Native App
 * https://github.com/facebook/react-native
 *
 * @format
 */

import React, {useState, useRef, useEffect} from 'react';
import {
  View,
  Button,
  StyleSheet,
  Alert
} from 'react-native';
import { RNCamera } from 'react-native-camera';
// import { RNS3 } from 'react-native-upload-aws-s3';
import AWS, { S3, KinesisVideo, Kinesis } from 'aws-sdk';
import uuid from 'react-native-uuid';
import { mediaDevices, RTCView, RTCPeerConnection } from 'react-native-webrtc';
import {SignalingClient, Role} from "amazon-kinesis-video-streams-webrtc";

const AWS_ACCESS_KEY = '';
const AWS_SECRET_KEY = '';
const AWS_S3_REGION = 'us-east-1';
const AWS_REGION = 'us-east-1';


const kinesisvideo = new AWS.Kinesis({
  region: AWS_REGION, 
  accessKeyId: AWS_ACCESS_KEY, 
  secretAccessKey: AWS_SECRET_KEY,
  apiVersion: '2013-12-02'
});

const s3 = new AWS.S3({
  accessKeyId: AWS_ACCESS_KEY,
  secretAccessKey: AWS_SECRET_KEY,
  region: 'us-east-1',
});

function App() {

  const cameraRef = useRef(null);
  const localStream = useRef(null);
  const peerConnection = useRef(null);
  const [isRecording, setIsRecording] = useState(false);

  const startRecording = async () => {
    // startStream();
    if (cameraRef.current) {
      setIsRecording(true);
      startStream();
      const data = await cameraRef.current.recordAsync();
      uploadVideoToS3(data.uri);
      // console.log('Start Recording', data);
    }
  };

  const stopRecording = () => {
    if (cameraRef.current) {
      setIsRecording(false);
      stopStream();
      cameraRef.current.stopRecording();
    }
  };

  const stopStream = async () => {
    // signalingClient.current.close();
    localStream.current.getTracks().forEach(track => track.stop());
    localStream.current = null;
    peerConnection.current.close();
    peerConnection.current = null;
  };

  const uploadVideoToS3 = async (fileUri) => {
    const video = await fetch(fileUri);
    const content = await video.blob();
    const myUuid = uuid.v4();

    var params = {
      Body: content, 
      Bucket: 'create-camera-test', 
      Key: myUuid, 
      ContentType: 'video/mp4'
    };

     // Upload to S3
    try {
      console.log('upload to s3');
      const result =  await s3.upload(params).promise();
      console.log('result', result);
      Alert.alert('Success upload to S3');
    } catch (error) {
      console.error('error', error);
    }
  };

  const startStream = async () => {

    try {
      localStream.current = await mediaDevices.getUserMedia({ video: true, audio: true });
      console.log('localstream', localStream.current);
      // Create peer connection
      const configuration = {
        iceServers: [
          {
            urls: 'stun:stun.l.google.com:19302',
          },
        ],
      };
      peerConnection.current = new RTCPeerConnection(configuration);

      // Add local stream to peer connection
      localStream.current.getTracks().forEach(track => {
        peerConnection.current.addTrack(track, localStream.current);
      });

      var credentials = {accessKeyId: AWS_ACCESS_KEY, secretAccessKey: AWS_SECRET_KEY};
      var region = AWS_REGION;
      var channelARN  = '';
      var clientId = null;

      var kinesisVideoClient = new KinesisVideo({
        region: region,
        credentials: credentials,
        // correctClockSkew: true,
      });
      const stream = await kinesisVideoClient.createStream({StreamName: 'stream'}).promise();
      console.log(stream);
      var params = {
        ChannelARN: channelARN,
        SingleMasterChannelEndpointConfiguration: {
          Protocols: ['HTTPS'],
          Role: "MASTER"
        }
        // APIName: 'GET_DASH_STREAMING_SESSION_URL' // 'GET_DASH_STREAMING_SESSION_URL' or 'GET_MEDIA' 
      };
      console.log(params);
      const channelEndpoint = await kinesisVideoClient.getSignalingChannelEndpoint(params).promise();
    // console.log('endpoint', endpointsByProtocol);
      var signalingClient = new SignalingClient({
        kinesisVideoClient,
        channelEndpoint,
        channelARN,
        clientId,
        role: Role.MASTER,
        region,
        credentials,
        systemClockOffset: kinesisVideoClient.config.systemClockOffset
      });

      // Connect the signaling channel
      // signalingClient.connect();

      // Handle negotiation
      signalingClient.on('open', async () => {
        const offer = await peerConnection.current.createOffer();
        console.log('offer', offer);
        await peerConnection.current.setLocalDescription(offer);
        signalingClient.sendSdp(offer);
      });

      signalingClient.on('sdpAnswer', async (answer) => {
        await peerConnection.current.setRemoteDescription(answer);
      });

    } catch (error) {
      console.error('startStream', error);
    }
  };
  

  return (
    <View style={styles.container}>
      <RNCamera
        ref={cameraRef}
        style={styles.preview}
      />
      {localStream.current && <RTCView streamURL={localStream.current.toURL()} />}
      <View style={{ flex: 1, flexDirection: 'row', justifyContent: 'center' }}>
        <Button 
          title={isRecording ? "Stop" : "Start"}
          onPress={isRecording ? stopRecording : startRecording}
        />
      </View>
    </View>

  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    flexDirection: 'column',
    backgroundColor: 'black',
  },
  preview: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});

export default App;
