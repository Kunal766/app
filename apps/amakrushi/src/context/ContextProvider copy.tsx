"use client";
import {
  FC,
  ReactElement,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { AppContext } from ".";
import _ from "underscore";
import { send } from "../components/websocket";

import { UserType } from "../types";
import { IntlProvider } from "react-intl";
import { useLocalization, useSocket } from "../hooks";
import toast from "react-hot-toast";
import flagsmith from "flagsmith/isomorphic";
import { io } from "socket.io-client";
import { Button } from "@chakra-ui/react";

function loadMessages(locale: string) {
  switch (locale) {
    case "en":
      return import("../../lang/en.json");
    case "or":
      return import("../../lang/or.json");
    default:
      return import("../../lang/en.json");
  }
}

const URL = process.env.NEXT_PUBLIC_SOCKET_URL || "";

const ContextProvider: FC<{
  locale: any;
  localeMsgs: any;
  setLocale: any;
  children: ReactElement;
}> = ({ locale, children, localeMsgs, setLocale }) => {
  const t = useLocalization();

  const [users, setUsers] = useState<UserType[]>([]);
  const [currentUser, setCurrentUser] = useState<UserType>();
  const [loading, setLoading] = useState(false);
  const [isMsgReceiving, setIsMsgReceiving] = useState(false);
  const [messages, setMessages] = useState<Array<any>>([]);
  const [socketSession, setSocketSession] = useState<any>();
  const [newSocket, setNewSocket] = useState<any>();
  const timer1 = flagsmith.getValue("timer1", { fallback: 5000 });
  const timer2 = flagsmith.getValue("timer2", { fallback: 25000 });

  const [isConnected, setIsConnected] = useState(newSocket?.connected || false);
  console.log(messages);

  // const connect = useCallback((): void => {
  //   console.log("socket debug: socket?.connect triggered");
  //   socket?.connect();
  // }, [socket]);

  useEffect(() => {
    if (localStorage.getItem("phoneNumber") && localStorage.getItem("auth")) {
      setNewSocket(
        io(URL, {
          transportOptions: {
            polling: {
              extraHeaders: {
                Authorization: `Bearer ${localStorage.getItem("auth")}`,
                channel: "akai",
              },
            },
          },
          query: {
            deviceId: `akai:${localStorage.getItem("phoneNumber")}`,
          },
          autoConnect: false,
          // transports: ['polling', 'websocket'],
          upgrade: false,
        })
      );
    }
  }, []);

  const updateMsgState = useCallback(
    ({
      user,
      msg,
      media,
    }: {
      user: { name: string; id: string };
      msg: { content: { title: string; choices: any }; messageId: string };
      media: any;
    }) => {
      const newMsg = {
        username: user?.name,
        text: msg.content.title,
        choices: msg.content.choices,
        position: "left",
        id: user?.id,
        botUuid: user?.id,
        messageId: msg?.messageId,
        sentTimestamp: Date.now(),
        ...media,
      };
      // setMessages((prev: any) => [...prev, newMsg]);
      setMessages((prev: any) => _.uniq([...prev, newMsg], ["messageId"]));
    },
    []
  );

  const onMessageReceived = useCallback(
    (msg: any): void => {
      console.log("#-debug:", { msg });
      setLoading(false);
      setIsMsgReceiving(false);
      // @ts-ignore
      const user = JSON.parse(localStorage.getItem("currentUser"));
      //  console.log("qwe12 message: ", { msg, currentUser, uu: JSON.parse(localStorage.getItem('currentUser')) });
      if (msg.content.msg_type.toUpperCase() === "IMAGE") {
        updateMsgState({
          user,
          msg,
          media: { imageUrl: msg?.content?.media_url },
        });
      } else if (msg.content.msg_type.toUpperCase() === "AUDIO") {
        updateMsgState({
          user,
          msg,
          media: { audioUrl: msg?.content?.media_url },
        });
      } else if (msg.content.msg_type.toUpperCase() === "VIDEO") {
        updateMsgState({
          user,
          msg,
          media: { videoUrl: msg?.content?.media_url },
        });
      } else if (
        msg.content.msg_type.toUpperCase() === "DOCUMENT" ||
        msg.content.msg_type.toUpperCase() === "FILE"
      ) {
        updateMsgState({
          user,
          msg,
          media: { fileUrl: msg?.content?.media_url },
        });
      } else if (msg.content.msg_type.toUpperCase() === "TEXT") {
        updateMsgState({ user, msg, media: {} });
      }

      localStorage.setItem(
        "userMsgs",
        JSON.stringify([
          ...messages,
          {
            username: "AI",
            text: msg.content.title,
            choices: msg.content.choices,
            position: "left",
          },
        ])
      );
    },
    [messages, updateMsgState]
  );

  useEffect(() => {
    if (!isConnected && newSocket && !newSocket.connected) {
      console.log("#--- socket connect called");
      newSocket.connect();
      setIsConnected(true);
    }
  }, [isConnected, newSocket]);

  useEffect(() => {
    function onConnect(): void {
      console.log("socket:  onConnect callback");
      setIsConnected(true);
    }

    function onDisconnect(): void {
      console.log("socket: disconnecting");
      setIsConnected(false);
    }

    function onSessionCreated(sessionArg: { session: any }) {
      console.log("#-debug dd:", { sessionArg });
      setSocketSession(sessionArg);
    }

    function onException(exception: any) {
      toast.error(exception?.message);
    }

    console.log("#-debug :assigning");
    console.log("debug ddd: if socket ready");
    console.log("#--- new soccket assign before", { newSocket });
    if (newSocket) {
      console.log("#--- new soccket assign");
      newSocket.on("connect", onConnect);
      newSocket.on("disconnect", onDisconnect);
      newSocket.on("botResponse", onMessageReceived);

      newSocket.on("exception", onException);
      newSocket.on("session", onSessionCreated);
    }

    return () => {
      if (newSocket) {
        console.log("#-debug : returning everything");
        // if (isSocketReady && isConnected) {
        //   console.log("debug: return")
        // newSocket.disconnect();
        //socket?.off("connect", );
        // socket?.off("disconnect", onDisconnect);
        // socket?.off("botResponse", onMessageReceived);
        // socket?.off("session", () => setSocketSession(null));
        // }
      }
    };
  }, [isConnected, newSocket, onMessageReceived]);

  const onChangeCurrentUser = useCallback((newUser: UserType) => {
    setCurrentUser({ ...newUser, active: true });
    localStorage.removeItem("userMsgs");
    setMessages([]);
  }, []);

  const sendMessage = useCallback(
    (text: string, media: any, isVisibile = true): void => {
      setLoading(true);
      setIsMsgReceiving(true);
      console.log("#-debug ddd:", { socketSession });
      if (newSocket && !socketSession) {
        toast(
          (t) => (
            <div>
              You are Disconnected,plz
              <Button
                onClick={() => {
                  toast.dismiss(t.id);
                  newSocket.connect();
                }}
              >
                click to connect again
              </Button>
            </div>
          ),
          {
            icon: "",
            duration: 10000,
          }
        );
        return;
      }
      send({ text, socketSession, socket: newSocket });
      if (isVisibile)
        if (media) {
          if (media.mimeType.slice(0, 5) === "image") {
          } else if (media.mimeType.slice(0, 5) === "audio" && isVisibile) {
          } else if (media.mimeType.slice(0, 5) === "video") {
          } else if (media.mimeType.slice(0, 11) === "application") {
          } else {
          }
        } else {
          localStorage.setItem(
            "userMsgs",
            JSON.stringify([
              ...messages,
              {
                username: "User",
                text: text,
                position: "right",
                botUuid: currentUser?.id,
                disabled: true,
              },
            ])
          );

          //@ts-ignore
          setMessages((prev: any) => [
            ...prev.map((prevMsg: any) => ({ ...prevMsg, disabled: true })),
            {
              username: "state.username",
              text: text,
              position: "right",
              botUuid: currentUser?.id,
              payload: { text },
              time: Date.now(),
              disabled: true,
              messageId: `${Date.now()}`,
              repliedTimestamp: Date.now(),
            },
          ]);
        }
    },
    [currentUser?.id, messages, newSocket, socketSession]
  );

  useEffect(() => {
    let secondTimer: any;
    const timer = setTimeout(() => {
      if (isMsgReceiving && loading) {
        toast.error(t("message.taking_longer"));
        secondTimer = setTimeout(() => {
          if (isMsgReceiving && loading) {
            toast.error(t("message.retry"));
            setIsMsgReceiving(false);
            setLoading(false);
          }
        }, timer2);
      }
    }, timer1);

    return () => {
      clearTimeout(timer);
      clearTimeout(secondTimer);
    };
  }, [isMsgReceiving, loading, t, timer1, timer2]);

  const values = useMemo(
    () => ({
      currentUser,
      allUsers: users,
      toChangeCurrentUser: onChangeCurrentUser,
      sendMessage,
      messages,
      setMessages,
      loading,
      setLoading,
      socketSession,
      isMsgReceiving,
      setIsMsgReceiving,
      locale,
      setLocale,
      localeMsgs,
    }),
    [
      locale,
      setLocale,
      localeMsgs,
      currentUser,
      socketSession,
      users,
      onChangeCurrentUser,
      sendMessage,
      messages,
      loading,
      setLoading,
      isMsgReceiving,
      setIsMsgReceiving,
    ]
  );

  return (
    //@ts-ignore
    <AppContext.Provider value={values}>
      <IntlProvider locale={locale} messages={localeMsgs}>
        {children}
      </IntlProvider>
    </AppContext.Provider>
  );
};

const SSR: FC<{ children: ReactElement }> = ({ children }) => {
  const defaultLang = flagsmith.getValue("default_lang", { fallback: "en" });
  const [locale, setLocale] = useState(
    localStorage.getItem("locale") || defaultLang
  );
  const [localeMsgs, setLocaleMsgs] = useState<Record<string, string> | null>(
    null
  );
  useEffect(() => {
    loadMessages(locale).then((res) => {
      //@ts-ignore
      setLocaleMsgs(res);
    });
  }, [locale]);

  if (typeof window === "undefined") return null;
  return (
    <IntlProvider locale={locale} messages={localeMsgs}>
      <ContextProvider
        locale={locale}
        setLocale={setLocale}
        localeMsgs={localeMsgs}
      >
        {children}
      </ContextProvider>
    </IntlProvider>
  );
};
export default SSR;
