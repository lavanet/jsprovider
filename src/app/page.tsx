"use client";
import { InformationCircleIcon } from "@heroicons/react/solid";
import {
  Card,
  Grid,
  Title,
  Text,
  Tab,
  TabList,
  TabGroup,
  TabPanel,
  TabPanels,
  BadgeDelta,
  DeltaType,
  Flex,
  Metric,
  ProgressBar,
  AreaChart,
  Color,
  Icon,
  MultiSelect,
  MultiSelectItem,
  Select,
  SelectItem,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeaderCell,
  TableRow,
} from "@tremor/react";
import { useState, useEffect, useRef } from "react";
import { LavaSDKOptions, LavaSDK } from "@lavanet/lava-sdk";
import { useRouter } from 'next/navigation'
import { usePathname, useSearchParams } from 'next/navigation'

const rpc = "https://rest-public-rpc-testnet2.lavanet.xyz"

const config: LavaSDKOptions = {
  badge: {
    badgeServerAddress: process.env.NEXT_PUBLIC_BADGE_SERVER_ADDRESS || "",
    projectId: process.env.NEXT_PUBLIC_BADGE_PROJECT_ID || "",
  },
  chainID: "LAV1",
  rpcInterface: "rest",
  geolocation: "2",
};

interface Provider {
  moniker: string
  address: string
  totalStake?: number
  chains: StakeEntry[]
}

interface ChainInfoRoot {
  chainInfoList: ChainInfoList[]
}

interface ChainInfoList {
  chainName: string
  chainID: string
  enabledApiInterfaces: string[]
  api_count: string
  providers?: Map<string, Provider>
  totalStake?: number
}

interface ProvidersChainRoot {
  stakeEntry: StakeEntry[]
  output: string
}

interface StakeEntry {
  stake: Stake
  address: string
  stake_applied_block: string
  endpoints: Endpoint[]
  geolocation: string
  chain: string
  moniker: string
}

interface Stake {
  denom: string
  amount: string
}

interface Endpoint {
  iPPORT: string
  geolocation: string
  addons: any[]
  api_interfaces: string[]
  extensions: any[]
}

function ulavaToLava(x: number) {
  if (x == 0) {
    return '0 LAVA'
  }
  return `${Math.trunc(x / 1000000)} LAVA`
}

export default function Home() {
  const [sdkInstance, setSdkInstance] = useState<null | LavaSDK>(null);
  const [sdkLoadTime, setSdkLoadTime] = useState(0);
  const [chainList, setChainList] = useState<ChainInfoList[]>([]);
  const [addressToProvider, setAddressToProvider] = useState(new Map<string, Provider>());
  const [activeChains, setActiveChains] = useState(0);
  const [totalStake, setTotalStake] = useState(0);
  const [tabProvider, setTabProvider] = useState<Provider | null>(null);
  const [blockNumber, setBlockNumber] = useState(0);
  const [blockTime, setBlockTime] = useState<Date>(new Date());
  const tabRef = useRef<HTMLDivElement | null>(null);

  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (chainList == null || chainList.length == 0) {
      return
    };

    const getProviders = async () => {
      let tmpKeyToProvider = new Map<string, Provider>;

      const t = chainList.map(async (chain): Promise<any> => {
        return fetch(rpc + `/lavanet/lava/pairing/providers/${chain.chainID}?showFrozen=true`)
          .then(res => res.json() as Promise<ProvidersChainRoot>)
          .then(r => {
            r.stakeEntry.forEach((stake) => {
              if (!tmpKeyToProvider.has(stake.address)) {
                tmpKeyToProvider.set(stake.address, {
                  address: stake.address,
                  moniker: stake.moniker,
                  chains: []
                })
              }
              const provider = tmpKeyToProvider.get(stake.address);
              provider?.chains.push(stake);

              for (let i = 0; i < chainList.length; i++) {
                if (chainList[i].chainID == stake.chain) {
                  if (chainList[i].providers === undefined) {
                    chainList[i].providers = new Map<string, Provider>();
                  }
                  if (provider != null) {
                    chainList[i].providers?.set(provider?.address, provider)
                  }
                  break;
                }
              }
            });
          });
      });
      await Promise.all(t);

      let totalTotalStake = 0;
      Array.from(tmpKeyToProvider.keys()).map((k: string) => {
        let provider = tmpKeyToProvider.get(k);
        if (provider == null) {
          return;
        }
        let totalStake = 0;
        provider.chains.forEach((chain) => {
          totalStake += parseInt(chain.stake.amount);

        })
        provider.totalStake = totalStake;
        totalTotalStake += totalStake;
      });
      setAddressToProvider(tmpKeyToProvider);
      setTotalStake(totalTotalStake);

      let tActiveChains = 0;
      chainList?.map((chain) => {
        if (chain.providers != null && Array.from(chain.providers).length > 0) {
          tActiveChains += 1;
        }
      });
      setActiveChains(tActiveChains);
    };
    getProviders();
  }, [chainList]);

  useEffect(() => {
    if (sdkInstance === null) {
      return;
    }
    const getChains = async () => {
      const block = await sdkInstance.sendRelay({
        method: "GET",
        url: "/cosmos/base/tendermint/v1beta1/blocks/latest",
      });
      let ret;
      try {
        ret = JSON.parse(block);
        setBlockNumber(Number(ret["block"]["header"]["height"]));
        setBlockTime(new Date(Date.parse(ret["block"]["header"]["time"])));
      } catch (error) {
        console.log("cosmosRelayParse", error, block)
      }
      
      const info = await sdkInstance.sendRelay({
        method: "GET",
        url: "/lavanet/lava/spec/show_all_chains",
      });

      let j: ChainInfoRoot = JSON.parse(info);
      setChainList(j.chainInfoList);

      /*const info1 = await sdkInstance.sendRelay({
        method: "GET",
        url: "/lavanet/lava/pairing/providers/[^/s]+",
        data: {
          "chainID": "LAV1",
        },
      });
      console.log(info1);*/
    };
    getChains();
  }, [sdkInstance]);

  useEffect(() => {
    const sdkInit = async () => {
      let t;
      try {
        const t0 = performance.now();
        t = await new LavaSDK(config);
        const t1 = performance.now();
        setSdkLoadTime(t1 - t0);
        setSdkInstance(t);
      } catch (err) {
        console.error("Error initializing SDK for chain:", err);
      }
    };

    sdkInit();
  }, []);

  useEffect(() => {
    const go = searchParams.get('p');
    if (go == null) {
      return;
    }
    const provider = addressToProvider.get(go);
    if (provider == null) {
      return
    }
    setTabProvider(provider);
    setTimeout(() => {
      const el = tabRef?.current?.lastElementChild as HTMLElement;
      el.click();
    }, 25);
  }, [pathname, searchParams, addressToProvider])

  return (
    <main className="mx-auto p-12 max-w-7xl">
      <Title>Lava JS Provider Info</Title>
      <Text>Show provider info directly from lava over lava using lavaSDK.</Text>
      <Text>
        {sdkLoadTime == 0 ? 'Loading Sdk...' : `SDK load time ${sdkLoadTime}.`}
        {blockNumber == 0 ? '' : ` Lava block number ${blockNumber} at ${blockTime}.`}
      </Text>
      <TabGroup className="mt-6">
        <TabList ref={tabRef}>
          <Tab onClick={() => router.push('?')}>Chains</Tab>
          <Tab onClick={() => router.push('?')}>Providers</Tab>
          {tabProvider == null ? <></> : <Tab>{tabProvider.moniker}</Tab>}
        </TabList>
        <TabPanels>
          <TabPanel>
            <Grid numItemsLg={3} className="mt-6 gap-6">
              <Card>
                <Flex alignItems="start">
                  <div className="truncate">
                    <Text>Active Chains</Text>
                    <Title className="truncate">{activeChains}</Title>
                  </div>
                </Flex>
              </Card>
              <Card>
                <Flex alignItems="start">
                  <div className="truncate">
                    <Text>Address</Text>
                    <Title className="truncate">{Array.from(addressToProvider).length}</Title>
                  </div>
                </Flex>
              </Card>
              <Card>
                <Flex alignItems="start">
                  <div className="truncate">
                    <Text>Total Stake</Text>
                    <Title className="truncate">{ulavaToLava(totalStake)}</Title>
                  </div>
                </Flex>
              </Card>
            </Grid>
            <div className="mt-6">
              <Card>
                <>
                  <div>
                    <Flex className="space-x-0.5" justifyContent="start" alignItems="center">
                      <Title>Chain List</Title>
                    </Flex>
                  </div>
                  <Table className="mt-6">
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Chain Name</TableHeaderCell>
                        <TableHeaderCell>Chain ID</TableHeaderCell>
                        <TableHeaderCell className="text-right">#Providers</TableHeaderCell>
                      </TableRow>
                    </TableHead>
                    <TableBody>
                      {chainList?.map((chain) => {
                        if (chain.providers != null) {
                          return (
                            <TableRow key={chain.chainID}>
                              <TableCell>{chain.chainName}</TableCell>
                              <TableCell>{chain.chainID}</TableCell>
                              <TableCell className="text-right">{chain.providers != null ? Array.from(chain.providers).length : 0}</TableCell>
                            </TableRow>
                          )
                        }
                      })}
                    </TableBody>
                  </Table>
                </>
              </Card>
            </div>
          </TabPanel>
          <TabPanel>
            <div className="mt-6">
              <Card>
                <>
                  <div>
                    <Flex className="space-x-0.5" justifyContent="start" alignItems="center">
                      <Title>Providers</Title>
                    </Flex>
                  </div>
                  <Table className="mt-6">
                    <TableHead>
                      <TableRow>
                        <TableHeaderCell>Moniker</TableHeaderCell>
                        <TableHeaderCell>Address</TableHeaderCell>
                        <TableHeaderCell className="text-right">Staked Chains</TableHeaderCell>
                        <TableHeaderCell className="text-right">Total Stake</TableHeaderCell>
                      </TableRow>
                    </TableHead>

                    <TableBody>
                      {Array.from(addressToProvider.values()).map((v: Provider) => {
                        return (
                          <TableRow key={v.address}>
                            <TableCell><a href="#" className="hover:underline" onClick={() => router.push(`?p=${v.address}`)}>{v.moniker}</a></TableCell>
                            <TableCell><a href="#" className="hover:underline" onClick={() => router.push(`?p=${v.address}`)}>{v.address}</a></TableCell>
                            <TableCell className="text-right">{v.chains.length}</TableCell>
                            <TableCell className="text-right">{v.totalStake}</TableCell>
                          </TableRow>
                        )
                      })}
                    </TableBody>
                  </Table>
                </>
              </Card>
            </div>
          </TabPanel>
          {tabProvider == null ? <></> :
            <TabPanel>
              <Grid numItemsLg={3} className="mt-6 gap-6">
                <Card>
                  <Flex alignItems="start">
                    <div className="truncate">
                      <Text>Provider</Text>
                      <Title className="truncate">{tabProvider.moniker}</Title>
                    </div>
                  </Flex>
                </Card>
                <Card>
                  <Flex alignItems="start">
                    <div className="truncate">
                      <Text>Chains</Text>
                      <Title className="truncate">{tabProvider.chains.length}</Title>
                    </div>
                  </Flex>
                </Card>
                <Card>
                  <Flex alignItems="start">
                    <div className="truncate">
                      <Text>Total Stake</Text>
                      <Title className="truncate">{tabProvider.totalStake == null ? <></> : ulavaToLava(tabProvider.totalStake)}</Title>
                    </div>
                  </Flex>
                </Card>
              </Grid>
              <div className="mt-6">
                <Card>
                  <>
                    <div>
                      <Flex className="space-x-0.5" justifyContent="start" alignItems="center">
                        <Title>Provider Chains</Title>
                      </Flex>
                    </div>
                    <Table className="mt-6">
                      <TableHead>
                        <TableRow>
                          <TableHeaderCell>Chain</TableHeaderCell>
                          <TableHeaderCell>Stake</TableHeaderCell>
                          <TableHeaderCell>Geolocation</TableHeaderCell>
                          <TableHeaderCell>Start Block</TableHeaderCell>
                        </TableRow>
                      </TableHead>
                      <TableBody>
                        {tabProvider.chains?.map((chain) => {
                          return (
                            <TableRow key={`${chain.chain}${chain.address}`}>
                              <TableCell>{chain.chain}</TableCell>
                              <TableCell>{`${chain.stake.amount} ${chain.stake.denom}`}</TableCell>
                              <TableCell>{chain.geolocation}</TableCell>
                              <TableCell>{chain.stake_applied_block}</TableCell>
                            </TableRow>
                          )
                        })}
                      </TableBody>
                    </Table>
                  </>
                </Card>
              </div>
            </TabPanel>
          }
        </TabPanels>
      </TabGroup>

    </main>
  )
}
