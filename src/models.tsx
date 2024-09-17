import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  userId: number;
  username: string;
  wallet: number;
  referrerId?: number;
  referralCount : number;
  bonus: number;
  ipAddress : string;
  status : 'ban' | 'unban';
  email_verified : boolean;
  verificationCode : number;
  date : Date;
}

const UserSchema: Schema = new Schema<IUser>({
  userId: { type: Number, required: true, unique: true },
  username: { type: String, required: true },
  wallet: { type: Number, default: 0 },
  referrerId: { type: Number, default: null },
  referralCount : { type: Number, default: 0 },
  bonus: { type: Number, default: 0 },
  ipAddress : String,
  status : { type: String , default : 'unban'},
  email_verified : { type: Boolean , default :  false },
  verificationCode : Number , 
  date: { type: Date, default: Date.now },
});


enum Status {
  Admin = 'admin',
  User = 'creator',
  Ban = 'member',
  Nonuser = 'nonuser'
}

interface IChannel extends Document {
  username: string;
  url : string;
  date : Date;
}


const ChannelSchema: Schema<IChannel> = new Schema({
  username: { type: String, required: true },
  url : { type: String, required: true },
  date: { type: Date, default: Date.now },
});

type  WithdrawalStatus =  'pending' | 'success' | 'fail'


interface IWithdrawalHistory extends Document {
  userId: number;
  amount: number;
  symbol: string;
  status: WithdrawalStatus;
  hash: string;
  date: Date;
  proposerId?: number;
  public_id : string;
  username : string;
}



const WithdrawalHistorySchema: Schema<IWithdrawalHistory> = new Schema({
  userId: { type: Number, required: true },
  amount: { type: Number, required: true },
  symbol: { type: String, default : 'USDT' },
  hash: { type: String, default : null },
  public_id : String ,
  status: { type: String, enum: ['pending' , 'success' , 'fail'],   default:  'pending' },
  date: { type: Date, default: Date.now },
  proposerId: { type: Number, default: null },
  username: { type: String, default : null },
});



export const Channel = mongoose.model<IChannel>('Channel', ChannelSchema);





interface IConfig extends Document {
  paymentKey: string;
  toggle_bot_off : boolean;
  toggle_withdrawals_on : boolean;
}


// Create a schema for the configuration
const ConfigSchema: Schema = new Schema<IConfig>({
  paymentKey: { type: String , default : null },
  toggle_bot_off : { type: Boolean , default : false  },
  toggle_withdrawals_on : { type: Boolean , default : false  }
});



export const Config = mongoose.model<IConfig>('Config', ConfigSchema);


export const WithdrawalHistory = mongoose.model<IWithdrawalHistory>('WithdrawalHistory', WithdrawalHistorySchema);
export default mongoose.model<IUser>('User', UserSchema);