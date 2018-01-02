import Bignum from './bignum';
import {Slots} from './slots';

export class RoundChanges {
  private roundFees: number;
  private roundRewards: number[];

  constructor(scope: { roundFees?: number, roundRewards: number[] }, private slots: Slots) {
    this.roundFees    = Math.floor(scope.roundFees) || 0;
    this.roundRewards = scope.roundRewards || [];
  }

  /**
   * Calculates rewards at round position.
   * Fees and feesRemaining based on slots
   */
  public at(index: number): { balance: number, fees: number, feesRemaining: number, rewards: number } {
    const fees          = new Bignum(this.roundFees.toPrecision(15)).dividedBy(this.slots.delegates).floor();
    const feesRemaining = new Bignum(this.roundFees.toPrecision(15)).minus(fees.times(this.slots.delegates));
    const rewards       = this.roundRewards[index] ? new Bignum(this.roundRewards[index].toPrecision(15)).floor() : 0;

    return {
      balance      : Number(fees.add(rewards).toFixed()),
      fees         : Number(fees.toFixed()),
      feesRemaining: Number(feesRemaining.toFixed()),
      rewards      : Number(rewards.toFixed()),
    };
  }
}
