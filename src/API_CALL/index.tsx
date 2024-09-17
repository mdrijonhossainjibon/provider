import axios, { AxiosRequestConfig, AxiosResponse } from "axios";

export interface API_CALL_PROPS {
  method?: Method;
  url?: string;
  baseURL?: string;
  body?: any;
  apiVersion?: '1.0';
  headers?: headers;
  params ? :  any;
  data? : any;
  

}
export type Method =
    | 'get' | 'GET'
    | 'delete' | 'DELETE'
    | 'head' | 'HEAD'
    | 'options' | 'OPTIONS'
    | 'post' | 'POST'
    | 'put' | 'PUT'
    | 'patch' | 'PATCH'
    | 'purge' | 'PURGE'
    | 'link' | 'LINK'
    | 'unlink' | 'UNLINK';


type headers = {
  contentType?: 'json' | 'image' | 'text' | 'video'; // Add more types if needed
  'X-CSRF-Token'?: string;
  'X-API-Key' ?: string;
  'Rocket-Pay-Key' ?: string
};



type message = {
  error?: any;
  success?: any;
};

type responstype = {
  result?: any ;
  message?: message;
  price ?: number;
  market_data ?: any;
  data ? : any;
  rawData ? : any;
  xpub ?: string;
  mnemonic ?: string;
  address?:string;
  key ? : any;
  txId ? : string;
  cause? : any;
  success ?:any;
  ok?: boolean,
  error_code ?: number,
  error ? : {  code ? : number , message?: string , ok  ?: any },
  description ?: string;
  errors ?:  Errors[]
};


interface Errors {
  property : string;
  error : string;
}


export interface TypeApiPromise {
  status?: number;
  response?: responstype;
  
  
}

export const API_CALL = async (props: API_CALL_PROPS): Promise<TypeApiPromise> => {
  const api = axios.create({
    baseURL: props?.baseURL || 'http://localhost:4000',
  });

  // Define default headers for different content types
  const defaultHeaders: Record<string, string> = {
    'Content-Type': 'application/json'
  };

  const config: AxiosRequestConfig = {
    data :props.body,
    ...props,
    headers: {
      ...defaultHeaders,
      ...props?.headers,
    },
 
  };

  try {
    // If contentType is 'image', use FormData for image upload
    if (props.headers?.contentType === 'image') {
      const formData = new FormData();
      formData.append('image', props.body);
      config.data = formData;
    }

    const response: AxiosResponse = await api(config);

    return {
      status: response.status,
      response: response.data,
    };
  } catch (error) {
    if (axios.isAxiosError(error)) {
      if (error.response) {
        return {
          status: error.response.status,
          response: error.response.data ,
        };
      } else if (error.request) {
        return {
          status: 500,
          response: { message: { error: 'Network error occurred' } },
        };
      } else {
        return {
          status: 500,
          response: { message: { error: 'An error occurred' } },
        };
      }
    } else {
      return {
        status: 500,
        response: { message: { error: 'An error occurred' } },
      };
    }
  }
};
